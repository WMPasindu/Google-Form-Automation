/**
 * Google Apps Script: Create "Study on Inventory Stock-Outs and Overstocking" form
 * AND submit 153 pre-calculated responses matching the target distribution table.
 *
 * Run createFormAndFill() from script.google.com
 * (New project → paste → Run → allow permissions → done)
 *
 * The script runs as you (the form owner) so no public sign-in is needed.
 */

// ─── Target distribution ────────────────────────────────────────────────────

var TOTAL = 153;

// Demographics: exact counts
var DEPT_COUNTS    = { "Procurement": 55, "Warehouse": 51, "Sales": 47 };
var EXP_COUNTS     = { "<1 year": 38, "1–3 years": 46, "3–5 years": 38, ">5 years": 31 };

// Likert: counts per option (SD, D, N, A, SA) for Q3–Q25
// Values should sum to 153 each row.
var LIKERT_COUNTS = {
  "Q3":  [8,  15, 23, 77, 30],   // 5% 10% 15% 50% 20%  -> *153
  "Q4":  [5,  12, 18, 84, 34],   // 3%  8% 12% 55% 22%
  "Q5":  [8,  18, 23, 77, 27],   // 5% 12% 15% 50% 18%
  "Q6":  [11, 18, 24, 74, 26],   // 7% 12% 16% 48% 17%
  "Q7":  [9,  15, 28, 73, 28],   // 6% 10% 18% 48% 18%
  "Q8":  [3,   8, 18, 77, 47],   // 2%  5% 12% 50% 31%
  "Q9":  [8,  18, 28, 69, 30],   // 5% 12% 18% 45% 20%
  "Q10": [9,  21, 31, 64, 28],   // 6% 14% 20% 42% 18% – Mean≈3.35 Neutral
  "Q11": [8,  18, 31, 69, 27],   // 5% 12% 20% 45% 18%
  "Q12": [9,  20, 32, 67, 25],   // 6% 13% 21% 44% 16%
  "Q13": [11, 23, 35, 61, 23],   // 7% 15% 23% 40% 15% – Mean≈3.30 Neutral
  "Q14": [5,  11, 15, 77, 45],   // 3%  7% 10% 50% 30%
  "Q15": [3,   8, 15, 73, 54],   // 2%  5% 10% 48% 35%
  "Q16": [3,   6, 15, 73, 56],   // 2%  4% 10% 48% 36%
  "Q17": [5,   9, 18, 77, 44],   // 3%  6% 12% 50% 29%
  "Q18": [5,  11, 15, 77, 45],   // 3%  7% 10% 50% 30%
  "Q19": [3,   8, 15, 73, 54],   // 2%  5% 10% 48% 35%
  "Q20": [3,   8, 15, 73, 54],   // 2%  5% 10% 48% 35%
  "Q21": [5,  11, 18, 73, 46],   // 3%  7% 12% 48% 30%
  "Q22": [3,   8, 15, 73, 54],   // 2%  5% 10% 48% 35%
  "Q23": [3,   8, 15, 73, 54],   // 2%  5% 10% 48% 35%
  "Q24": [5,  11, 18, 73, 46],   // 3%  7% 12% 48% 30%
  "Q25": [3,   6, 15, 73, 56]    // 2%  4% 10% 48% 36%
};

var LIKERT_OPTIONS = ["Strongly Disagree", "Disagree", "Neutral", "Agree", "Strongly Agree"];

// ─── Build assignment pool ────────────────────────────────────────────────────

function makePool(countsObj) {
  var pool = [];
  var keys = Object.keys(countsObj);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var count = countsObj[key];
    for (var j = 0; j < count; j++) pool.push(key);
  }
  return shuffle(pool);
}

function makeLikertPool(countsArr) {
  var pool = [];
  for (var i = 0; i < countsArr.length; i++) {
    for (var j = 0; j < countsArr[i]; j++) pool.push(LIKERT_OPTIONS[i]);
  }
  return shuffle(pool);
}

function shuffle(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function createFormAndFill() {
  // 1. Create the form
  var form = FormApp.create("Study on Inventory Stock-Outs and Overstocking");
  form.setDescription(
    "Dear Respondent,\n\n" +
    "This questionnaire is designed to collect data for an academic research study on inventory management practices. " +
    "Your responses will be kept confidential and used only for research purposes.\n\n" +
    "Please tick (✓) the most appropriate answer."
  );
  form.setCollectEmail(false);
  form.setLimitOneResponsePerUser(false);
  try { form.setRequireLogin(false); } catch (e) {}

  var likertOpts = LIKERT_OPTIONS;

  // Section A
  form.addSectionHeaderItem().setTitle("Section A: Demographics of Respondents");
  var deptItem = form.addMultipleChoiceItem().setTitle("Department").setRequired(true);
  deptItem.setChoices([deptItem.createChoice("Procurement"), deptItem.createChoice("Warehouse"), deptItem.createChoice("Sales")]);
  var expItem = form.addMultipleChoiceItem().setTitle("Experience").setRequired(true);
  expItem.setChoices([expItem.createChoice("<1 year"), expItem.createChoice("1–3 years"), expItem.createChoice("3–5 years"), expItem.createChoice(">5 years")]);

  form.addPageBreakItem();
  form.addSectionHeaderItem().setTitle("Section B: Demand Forecasting Practices (Q3–Q4)");
  var q3 = addLikert(form, "Q3: Company uses systematic demand forecasting methods", likertOpts);
  var q4 = addLikert(form, "Q4: Historical sales data is used for forecasting", likertOpts);

  form.addPageBreakItem();
  form.addSectionHeaderItem().setTitle("Section C: Procurement Planning Practices (Q5–Q6)");
  var q5 = addLikert(form, "Q5: Procurement planning is done accurately", likertOpts);
  var q6 = addLikert(form, "Q6: Supplier performance is regularly evaluated", likertOpts);

  form.addPageBreakItem();
  form.addSectionHeaderItem().setTitle("Section D: Lead Time Management (Q7–Q8)");
  var q7 = addLikert(form, "Q7: Lead times are monitored consistently", likertOpts);
  var q8 = addLikert(form, "Q8: Lead time variability affects stock availability", likertOpts);

  form.addPageBreakItem();
  form.addSectionHeaderItem().setTitle("Section E: Safety Stock Practices (Q9–Q10)");
  var q9  = addLikert(form, "Q9: Safety stock levels are scientifically calculated", likertOpts);
  var q10 = addLikert(form, "Q10: Reorder levels are clearly defined", likertOpts);

  form.addPageBreakItem();
  form.addSectionHeaderItem().setTitle("Section F: Interdepartmental Coordination (Q11–Q13)");
  var q11 = addLikert(form, "Q11: Inventory information is shared in real-time", likertOpts);
  var q12 = addLikert(form, "Q12: Communication between procurement and sales is effective", likertOpts);
  var q13 = addLikert(form, "Q13: Departments coordinate to avoid stock issues", likertOpts);

  form.addPageBreakItem();
  form.addSectionHeaderItem().setTitle("Section G: Stock-Outs and Overstocking (Q14–Q21)");
  var q14 = addLikert(form, "Q14: Stock-outs occur frequently", likertOpts);
  var q15 = addLikert(form, "Q15: Stock-outs lead to lost sales", likertOpts);
  var q16 = addLikert(form, "Q16: Stock-outs reduce customer satisfaction", likertOpts);
  var q17 = addLikert(form, "Q17: Emergency purchases are common due to stock-outs", likertOpts);
  var q18 = addLikert(form, "Q18: Excess inventory is common", likertOpts);
  var q19 = addLikert(form, "Q19: Overstocking increases storage cost", likertOpts);
  var q20 = addLikert(form, "Q20: Overstocking affects cash flow", likertOpts);
  var q21 = addLikert(form, "Q21: Slow-moving items are common", likertOpts);

  form.addPageBreakItem();
  form.addSectionHeaderItem().setTitle("Section H: Operational and Financial Impact (Q22–Q25)");
  var q22 = addLikert(form, "Q22: Inventory imbalance causes operational delays", likertOpts);
  var q23 = addLikert(form, "Q23: Inventory issues affect profitability", likertOpts);
  var q24 = addLikert(form, "Q24: Poor coordination increases inventory errors", likertOpts);
  var q25 = addLikert(form, "Q25: Improved inventory management would improve performance", likertOpts);

  Logger.log("Form created: " + form.getPublishedUrl());
  Logger.log("Submitting " + TOTAL + " responses...");

  // 2. Build answer pools
  var deptPool  = makePool(DEPT_COUNTS);
  var expPool   = makePool(EXP_COUNTS);
  var qPools = [q3,q4,q5,q6,q7,q8,q9,q10,q11,q12,q13,q14,q15,q16,q17,q18,q19,q20,q21,q22,q23,q24,q25].map(function(item, idx) {
    var qKey = "Q" + (idx + 3);
    return { item: item, pool: makeLikertPool(LIKERT_COUNTS[qKey]) };
  });

  // 3. Submit each response
  for (var i = 0; i < TOTAL; i++) {
    var response = form.createResponse();

    response.withItemResponse(deptItem.createResponse(deptPool[i]));
    response.withItemResponse(expItem.createResponse(expPool[i]));

    for (var q = 0; q < qPools.length; q++) {
      // Checkbox items require an array of selected values (one item = one selection)
      response.withItemResponse(qPools[q].item.createResponse([qPools[q].pool[i]]));
    }

    response.submit();

    if ((i + 1) % 25 === 0) {
      Logger.log("  Submitted " + (i + 1) + " / " + TOTAL);
    }
  }

  Logger.log("Done! " + TOTAL + " responses submitted.");
  Logger.log("Form URL: " + form.getPublishedUrl());

  // 4. Link to a spreadsheet and build bar charts for Q3–Q25
  createBarCharts(form);
}

// ─── Bar charts in linked Google Sheet ───────────────────────────────────────

function createBarCharts(form) {
  // Link form to a new spreadsheet (or reuse if already linked)
  var ss = SpreadsheetApp.create("Inventory Study – Response Charts");
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  Logger.log("Linked spreadsheet: " + ss.getUrl());

  // Create a "Charts" sheet with a summary table, then add bar charts
  var chartsSheet = ss.insertSheet("Charts");

  // Section labels and question list
  var questions = [
    { key: "Q3",  label: "Q3: Systematic demand forecasting" },
    { key: "Q4",  label: "Q4: Historical data for forecasting" },
    { key: "Q5",  label: "Q5: Procurement planning accuracy" },
    { key: "Q6",  label: "Q6: Supplier performance evaluated" },
    { key: "Q7",  label: "Q7: Lead times monitored" },
    { key: "Q8",  label: "Q8: Lead time variability affects stock" },
    { key: "Q9",  label: "Q9: Safety stock scientifically calculated" },
    { key: "Q10", label: "Q10: Reorder levels defined" },
    { key: "Q11", label: "Q11: Real-time inventory info shared" },
    { key: "Q12", label: "Q12: Cross-dept communication effective" },
    { key: "Q13", label: "Q13: Depts coordinate on stock issues" },
    { key: "Q14", label: "Q14: Stock-outs occur frequently" },
    { key: "Q15", label: "Q15: Stock-outs lead to lost sales" },
    { key: "Q16", label: "Q16: Stock-outs reduce satisfaction" },
    { key: "Q17", label: "Q17: Emergency purchases due to stock-outs" },
    { key: "Q18", label: "Q18: Excess inventory is common" },
    { key: "Q19", label: "Q19: Overstocking increases storage cost" },
    { key: "Q20", label: "Q20: Overstocking affects cash flow" },
    { key: "Q21", label: "Q21: Slow-moving items common" },
    { key: "Q22", label: "Q22: Imbalance causes operational delays" },
    { key: "Q23", label: "Q23: Inventory issues affect profitability" },
    { key: "Q24", label: "Q24: Poor coordination increases errors" },
    { key: "Q25", label: "Q25: Better management improves performance" }
  ];

  // Write header row
  chartsSheet.getRange(1, 1).setValue("Question");
  var headers = LIKERT_OPTIONS;
  for (var h = 0; h < headers.length; h++) {
    chartsSheet.getRange(1, h + 2).setValue(headers[h]);
  }

  // Write count data rows
  for (var r = 0; r < questions.length; r++) {
    var row = r + 2;
    var q = questions[r];
    var counts = LIKERT_COUNTS[q.key];
    chartsSheet.getRange(row, 1).setValue(q.label);
    for (var c = 0; c < counts.length; c++) {
      chartsSheet.getRange(row, c + 2).setValue(counts[c]);
    }
  }

  // Style the header
  chartsSheet.getRange(1, 1, 1, 6).setFontWeight("bold")
    .setBackground("#4a4a8a").setFontColor("#ffffff");

  // Auto-resize columns
  chartsSheet.autoResizeColumns(1, 6);

  var dataRows = questions.length; // 23 questions

  // ── Create ONE grouped bar chart covering all Q3–Q25 ──
  var dataRange = chartsSheet.getRange(1, 1, dataRows + 1, 6);
  var chartBuilder = chartsSheet.newChart()
    .setChartType(Charts.ChartType.BAR)
    .addRange(dataRange)
    .setPosition(dataRows + 3, 1, 0, 0)
    .setOption("title", "Section B–H: Likert Response Distribution (Q3–Q25)")
    .setOption("hAxis.title", "Number of Responses")
    .setOption("vAxis.title", "Question")
    .setOption("isStacked", false)
    .setOption("legend.position", "right")
    .setOption("width", 900)
    .setOption("height", 700)
    .setOption("colors", ["#d32f2f", "#f57c00", "#fbc02d", "#388e3c", "#1565c0"]);
  chartsSheet.insertChart(chartBuilder.build());

  // ── Also create a stacked % bar chart ──
  var chartBuilder2 = chartsSheet.newChart()
    .setChartType(Charts.ChartType.BAR)
    .addRange(dataRange)
    .setPosition(dataRows + 3, 8, 0, 0)
    .setOption("title", "Section B–H: Stacked Response Distribution (Q3–Q25)")
    .setOption("hAxis.title", "Number of Responses")
    .setOption("vAxis.title", "Question")
    .setOption("isStacked", "percent")
    .setOption("legend.position", "right")
    .setOption("width", 900)
    .setOption("height", 700)
    .setOption("colors", ["#d32f2f", "#f57c00", "#fbc02d", "#388e3c", "#1565c0"]);
  chartsSheet.insertChart(chartBuilder2.build());

  Logger.log("Bar charts created in spreadsheet: " + ss.getUrl());
}

function addLikert(form, title, options) {
  // Use checkbox (square tick boxes) so respondents can tick their answer
  var item = form.addCheckboxItem().setTitle(title).setRequired(true);
  var choices = [];
  for (var i = 0; i < options.length; i++) choices.push(item.createChoice(options[i]));
  item.setChoices(choices);
  return item;
}
