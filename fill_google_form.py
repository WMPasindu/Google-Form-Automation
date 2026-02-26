#!/usr/bin/env python3
"""
Fill a Google Form (checkboxes and multiple choice) with random selections and submit.
Aims for at least 500 responses.
"""

import re
import json
import random
import time
import argparse
from typing import Optional
from urllib.parse import urljoin

import requests

# Question types from Google Forms FB_PUBLIC_LOAD_DATA_
MULTIPLE_CHOICE_TYPE = 2  # single choice per question
CHECKBOX_TYPE = 4

# Minimum responses to submit
DEFAULT_TARGET_RESPONSES = 500
# Delay between submissions (seconds) to avoid rate limiting
DEFAULT_DELAY_SEC = 0.5


def extract_form_id_from_url(form_url: str) -> str:
    """Get form ID from viewform URL (e.g. 1FAIpQLSeuZiyN...)."""
    # URL like https://docs.google.com/forms/d/e/1FAIpQLSeuZiyN.../viewform
    m = re.search(r"/forms/d/e/([^/]+)/", form_url)
    if not m:
        raise ValueError("Could not find form ID in URL. Use the full viewform link.")
    return m.group(1)


def get_form_response_url(form_url: str, page_count: Optional[int] = None) -> str:
    """Build the formResponse POST URL. For multi-page forms, set page_count so pageHistory is included."""
    form_id = extract_form_id_from_url(form_url)
    base = f"https://docs.google.com/forms/d/e/{form_id}/formResponse"
    if page_count is not None and page_count > 1:
        # Required for multi-page forms: without this, only the first page's answers are saved
        history = ",".join(str(i) for i in range(page_count))
        return f"{base}?pageHistory={history}"
    return base


def fetch_form_html(form_url: str) -> str:
    """Fetch the form page HTML."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
    r = requests.get(form_url, headers=headers, timeout=30)
    r.raise_for_status()
    return r.text


def extract_fb_public_load_data(html: str) -> list:
    """Extract and parse FB_PUBLIC_LOAD_DATA_ from the form page."""
    # Match: var FB_PUBLIC_LOAD_DATA_ = [...];
    pattern = r"var\s+FB_PUBLIC_LOAD_DATA_\s*=\s*(.+?);\s*</script>"
    match = re.search(pattern, html, re.DOTALL)
    if not match:
        raise ValueError("Could not find FB_PUBLIC_LOAD_DATA_ in form page.")

    raw = match.group(1).strip()
    # Fix common JSON issues (e.g. "nulll" or trailing commas)
    raw = re.sub(r"\bnulll\b", "null", raw)
    raw = re.sub(r",\s*]", "]", raw)
    raw = re.sub(r",\s*}", "}", raw)
    return json.loads(raw)


def _parse_options(options_data: list) -> list[str]:
    """Extract option text from Google Forms options structure."""
    options = []
    for opt in options_data:
        if isinstance(opt, list) and opt and isinstance(opt[0], str):
            options.append(opt[0])
        elif isinstance(opt, str):
            options.append(opt)
    return options


def parse_choice_fields(load_data: list) -> list[dict]:
    """
    Parse checkbox and multiple-choice questions from FB_PUBLIC_LOAD_DATA_.
    Returns list of {"type": "checkbox"|"multiple_choice", "entry_id": str, "options": list[str]}.
    """
    fields = []
    try:
        form_node = load_data[1]
        if not isinstance(form_node, list):
            return fields
        questions = form_node[1] if len(form_node) > 1 else []
        if not isinstance(questions, list):
            return fields

        for q in questions:
            if not isinstance(q, list) or len(q) < 5:
                continue
            qtype = q[3] if len(q) > 3 else None
            if qtype not in (CHECKBOX_TYPE, MULTIPLE_CHOICE_TYPE):
                continue
            inner = q[4]
            if not isinstance(inner, list) or not inner or not isinstance(inner[0], list):
                continue
            block = inner[0]
            entry_id = block[0]
            options_data = block[1] if len(block) > 1 else []
            if not isinstance(options_data, list):
                continue
            options = _parse_options(options_data)
            if not options:
                continue
            field_type = "checkbox" if qtype == CHECKBOX_TYPE else "multiple_choice"
            fields.append({
                "type": field_type,
                "entry_id": str(entry_id),
                "options": options,
            })
    except (IndexError, KeyError, TypeError) as e:
        raise ValueError(f"Unexpected form structure: {e}") from e
    return fields


def _match_option(config_label: str, form_options: list[str]) -> str:
    """Match config label to form option (exact, then case-insensitive, then normalized)."""
    c = config_label.strip()
    for opt in form_options:
        if opt.strip() == c:
            return opt
    c_lower = c.lower()
    for opt in form_options:
        if opt.strip().lower() == c_lower:
            return opt
    # Normalize: collapse spaces so "< 1 year" matches "<1 year"
    def norm(s):
        return "".join(s.split()).lower()
    c_norm = norm(c)
    for opt in form_options:
        if norm(opt) == c_norm:
            return opt
    # Fallback: first form option that contains config label or vice versa
    for opt in form_options:
        if c.lower() in opt.lower() or opt.lower() in c.lower():
            return opt
    return form_options[0] if form_options else ""


def _percent_to_counts(percent_map: dict[str, float], total: int) -> dict[str, int]:
    """Convert percentage map to counts that sum to total. Returns option -> count."""
    labels = list(percent_map.keys())
    counts = {lbl: max(0, int(round(total * percent_map[lbl] / 100))) for lbl in labels}
    s = sum(counts.values())
    if s != total and labels:
        delta = total - s
        # Adjust largest count
        largest = max(labels, key=lambda l: counts[l])
        counts[largest] = counts[largest] + delta
    return counts


def build_responses_from_target_distribution(
    fields: list[dict], config: dict
) -> list[dict[str, list[str]]]:
    """
    Build exact response payloads so aggregate results match the target distribution.
    config: target_distribution.json with demographics (option -> count) and likert_questions (option -> percent).
    """
    total = config.get("total_responses", 153)
    demographics = config.get("demographics", {})
    likert = config.get("likert_questions", {})

    # Expect fields order: Department, Experience, Q3, Q4, ..., Q25 (25 fields)
    if len(fields) < 25:
        raise ValueError(f"Form has {len(fields)} choice fields; need at least 25 for target distribution.")

    # Build assignment list per field (list of 153 option strings as used in the form)
    assignments_by_field: list[list[str]] = []

    # Demographics: counts
    demo_keys = ["Department", "Experience"]
    for idx, key in enumerate(demo_keys):
        if idx >= len(fields):
            break
        count_map = demographics.get(key, {})
        form_opts = fields[idx]["options"]
        row = []
        for label, count in count_map.items():
            form_val = _match_option(label, form_opts)
            row.extend([form_val] * count)
        random.shuffle(row)
        if len(row) != total:
            raise ValueError(f"Demographic '{key}' counts sum to {len(row)}, expected {total}.")
        assignments_by_field.append(row)

    # Likert Q3–Q25: percentages -> counts
    likert_keys = [f"Q{i}" for i in range(3, 26)]
    for idx, key in enumerate(likert_keys):
        field_idx = 2 + idx
        if field_idx >= len(fields):
            break
        percent_map = likert.get(key, {})
        if not percent_map:
            continue
        count_map = _percent_to_counts(percent_map, total)
        form_opts = fields[field_idx]["options"]
        row = []
        for label, count in count_map.items():
            form_val = _match_option(label, form_opts)
            row.extend([form_val] * count)
        random.shuffle(row)
        if len(row) != total:
            row = row[:total] if len(row) > total else row + [form_opts[0]] * (total - len(row))
        assignments_by_field.append(row)

    # Build one payload per response index
    payloads = []
    for i in range(total):
        payload = {}
        for f_idx, f in enumerate(fields):
            if f_idx >= len(assignments_by_field):
                break
            entry_key = f"entry.{f['entry_id']}"
            val = assignments_by_field[f_idx][i] if i < len(assignments_by_field[f_idx]) else (f["options"][0] if f["options"] else "")
            payload[entry_key] = [val] if val else []
        payloads.append(payload)
    return payloads


def build_random_payload(fields: list[dict], single_choice_only: bool = False) -> dict[str, list[str]]:
    """Build form payload: one random option per field if single_choice_only; else 1–N for checkbox."""
    payload = {}
    for f in fields:
        entry_key = f"entry.{f['entry_id']}"
        opts = f["options"]
        if single_choice_only or f["type"] == "multiple_choice":
            chosen = [random.choice(opts)] if opts else []
        else:
            n = random.randint(1, len(opts)) if opts else 0
            chosen = random.sample(opts, n) if n else []
        payload[entry_key] = chosen
    return payload


def extract_hidden_fields(html: str) -> dict:
    """Extract fbzx and other hidden fields from the form page."""
    fields = {}
    m = re.search(r'name="fbzx"\s*value="([^"]*)"', html)
    if m:
        fields["fbzx"] = m.group(1)
    m = re.search(r'name="fvv"\s*value="([^"]*)"', html)
    if m:
        fields["fvv"] = m.group(1)
    return fields


def submit_form(response_url: str, payload: dict, page_count: Optional[int] = None,
                fbzx: str = "", fvv: str = "1") -> bool:
    """Submit the form via POST. Returns True if request succeeded."""
    data = []
    for key, values in payload.items():
        if isinstance(values, list):
            for v in values:
                data.append((key, v))
        else:
            data.append((key, values))

    if page_count and page_count > 1:
        data.append(("pageHistory", ",".join(str(i) for i in range(page_count))))
    if fbzx:
        data.append(("fbzx", fbzx))
        data.append(("partialResponse", f'[null,null,"{fbzx}"]'))
    if fvv:
        data.append(("fvv", fvv))

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": response_url.replace("/formResponse", "/viewform"),
        "Origin": "https://docs.google.com",
    }
    r = requests.post(
        response_url,
        data=data,
        headers=headers,
        timeout=15,
        allow_redirects=True,
    )
    return r.status_code == 200


def main():
    parser = argparse.ArgumentParser(
        description="Fill a Google Form (checkboxes and multiple choice) with random choices and submit many times."
    )
    parser.add_argument(
        "form_url",
        help="Full Google Form URL (viewform link)",
    )
    parser.add_argument(
        "-n", "--num",
        type=int,
        default=DEFAULT_TARGET_RESPONSES,
        help=f"Number of responses to submit (default: {DEFAULT_TARGET_RESPONSES})",
    )
    parser.add_argument(
        "-d", "--delay",
        type=float,
        default=DEFAULT_DELAY_SEC,
        help=f"Seconds to wait between submissions (default: {DEFAULT_DELAY_SEC})",
    )
    parser.add_argument(
        "-s", "--single-choice-only",
        action="store_true",
        help="Pick exactly one option per question (no multiple selections). Use for radio-style forms.",
    )
    parser.add_argument(
        "-t", "--target-distribution",
        metavar="JSON",
        help="Submit responses matching target distribution (JSON file with demographics + likert_questions %%).",
    )
    parser.add_argument(
        "--pages",
        type=int,
        metavar="N",
        help="Number of form pages (required for multi-page forms so Section B–H etc. are saved). Use 9 for the Inventory form.",
    )
    args = parser.parse_args()

    form_url = args.form_url.strip()
    if "/viewform" not in form_url:
        form_url = urljoin(form_url, "/viewform") if form_url.endswith("/") else form_url + "/viewform"

    print("Fetching form...")
    html = fetch_form_html(form_url)
    load_data = extract_fb_public_load_data(html)
    fields = parse_choice_fields(load_data)
    hidden = extract_hidden_fields(html)
    fbzx = hidden.get("fbzx", "")
    fvv = hidden.get("fvv", "1")

    if not fields:
        print("No checkbox or multiple choice questions found on this form. Exiting.")
        return 1

    mc = sum(1 for f in fields if f["type"] == "multiple_choice")
    cb = sum(1 for f in fields if f["type"] == "checkbox")
    print(f"Found {len(fields)} question(s): {mc} multiple choice, {cb} checkbox.")
    for i, f in enumerate(fields[:5], 1):
        print(f"  {i}. entry.{f['entry_id']} ({f['type']}): {len(f['options'])} options")
    if len(fields) > 5:
        print(f"  ... and {len(fields) - 5} more")

    page_count = args.pages if args.pages is not None else (9 if args.target_distribution else None)
    response_url = get_form_response_url(form_url)
    if page_count and page_count > 1:
        print(f"Using pageHistory for {page_count} pages (so all sections save).")
    success = 0
    fail = 0

    if args.target_distribution:
        with open(args.target_distribution, encoding="utf-8") as f:
            config = json.load(f)
        total = config.get("total_responses", 153)
        print(f"Target distribution: {total} responses from {args.target_distribution}")
        try:
            payloads = build_responses_from_target_distribution(fields, config)
        except (ValueError, KeyError) as e:
            print(f"Error building target distribution: {e}")
            return 1
        print(f"Submitting {len(payloads)} responses (delay={args.delay}s)...")
        for i, payload in enumerate(payloads):
            if submit_form(response_url, payload, page_count=page_count, fbzx=fbzx, fvv=fvv):
                success += 1
            else:
                fail += 1
            if (i + 1) % 50 == 0:
                print(f"  {i + 1}/{len(payloads)} done (ok={success}, fail={fail})")
            if i < len(payloads) - 1 and args.delay > 0:
                time.sleep(args.delay)
    else:
        target = max(1, args.num)
        if args.single_choice_only:
            print("Mode: single choice only (one option per question).")
        print(f"Submitting {target} responses (delay={args.delay}s)...")
        for i in range(target):
            payload = build_random_payload(fields, single_choice_only=args.single_choice_only)
            if submit_form(response_url, payload, page_count=page_count, fbzx=fbzx, fvv=fvv):
                success += 1
            else:
                fail += 1
            if (i + 1) % 50 == 0:
                print(f"  {i + 1}/{target} done (ok={success}, fail={fail})")
            if i < target - 1 and args.delay > 0:
                time.sleep(args.delay)

    print(f"Done. Success: {success}, Failed: {fail}")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    exit(main())
