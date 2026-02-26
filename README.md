# Google Form Filler (Checkboxes & Multiple Choice)

Fills a Google Form that has **checkbox** and **multiple choice** questions with random selections and submits it many times (e.g. 500+ responses).

---

## Create the form and fill with 153 responses (target table)

If you want a **new form** plus **153 responses** that aggregate to your exact demographics and Likert table (SD/D/N/A/SA %, Mean, Interpretation):

### Step 1: Create the form (Google Apps Script)

1. Go to [script.google.com](https://script.google.com) and sign in.
2. **New project** → delete any sample code in the editor.
3. Open **CreateInventoryForm.gs** in this repo, copy all of its code, and paste into the script editor.
4. Select the function **createForm** in the dropdown (top toolbar), then click **Run**.
5. First run: click **Review permissions** → choose your Google account → **Advanced** → **Go to … (unsafe)** → **Allow**.
6. After it runs, go to **Executions** (left sidebar) or **View → Logs** and copy the **form URL** (looks like `https://docs.google.com/forms/d/e/…/viewform`).

The new form will appear in your Google Drive as **“Study on Inventory Stock-Outs and Overstocking”** with Sections A–H and questions Q3–Q25 (single choice per question). In the form editor, open **Settings → Responses** and set to **"Anyone with the link"** can respond so the Python script can submit without signing in.

### Step 2: Fill the form with 153 responses (Python)

Use the URL from Step 1 and the included target distribution (demographics: Procurement 55, Warehouse 51, Sales 47; Experience 38/46/38/31; Likert % for Q3–Q25). **Use `--pages 9`** so responses for Section B–H (Q3–Q25) are saved; otherwise only Section A (Department, Experience) is recorded.

```bash
pip install -r requirements.txt
python3 fill_google_form.py "PASTE_FORM_URL_HERE" -t target_distribution.json --pages 9
```

After it finishes, open the form’s **Responses** tab (or the linked Google Sheet). You should see **153 responses** and, when you aggregate (e.g. pivot/counts), the same **Demographic** table and **Item / SD(%) / D(%) / N(%) / A(%) / SA(%) / Mean / SD / Interpretation** table as in your spec.

---

## Setup

```bash
cd /path/to/script
pip install -r requirements.txt
```

## Usage

```bash
python fill_google_form.py "https://docs.google.com/forms/d/e/YOUR_FORM_ID/viewform"
```

This submits **500 responses** by default. Each response randomly selects 1 to N options for every checkbox question.

### Options

| Option | Description |
|--------|-------------|
| `-n`, `--num` | Number of responses to submit (default: 500) |
| `-d`, `--delay` | Delay in seconds between submissions (default: 0.5) |
| `-s`, `--single-choice-only` | Pick **exactly one** option per question (no multiple selections). Use for forms where every question is radio-style. |
| `-t`, `--target-distribution` | Path to a JSON file defining target counts/percentages. Submits `total_responses` answers so aggregated results match the table (demographics + Likert %). |
| `--pages` N | For **multi-page forms**, set to the number of pages (e.g. 9). Required so answers on Section B–H (and later pages) are saved, not only Section A. |

### Examples

```bash
# Submit 500 responses, one option per question
python fill_google_form.py "YOUR_VIEWFORM_URL" -s

# Submit 153 responses matching target distribution (demographics + Likert % from target_distribution.json)
python fill_google_form.py "https://docs.google.com/forms/d/e/1FAIpQLSc4OjmhczHEXBnMf73aoWYMEqNXObVklEmUYAJEkqmju2f5Vw/viewform" -t target_distribution.json

# Submit 1000 with 1 second between each
python fill_google_form.py "YOUR_VIEWFORM_URL" -n 1000 -d 1

# Quick test: 10 responses, no delay
python fill_google_form.py "YOUR_VIEWFORM_URL" -n 10 -d 0
```

## Notes

- **Checkbox** and **multiple choice** questions are filled with random options; other types are ignored.
- With **target distribution** (`-t target_distribution.json`), the script submits exactly `total_responses` (e.g. 153) so that when you aggregate in Sheets you get the demographics table (Department 33%/33%/33%, Experience 25%/30%/25%/20%) and the Likert percentages (SD/D/N/A/SA) per question as in the JSON.
- The script parses the form from the public viewform page (no login).
- A small delay between submissions (e.g. 0.5s) helps avoid rate limiting.
- Form must be publicly accessible (Anyone with the link can respond).
