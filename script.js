"use strict";

const exprLine = document.getElementById("exprLine");
const currentEl = document.getElementById("current");
const keys = document.querySelector(".keys");
const statCount = document.getElementById("statCount");
const statLast = document.getElementById("statLast");
const historyList = document.getElementById("historyList");
const clearHistoryBtn = document.getElementById("clearHistory");

const SYMBOLS = { "+": "+", "-": "−", "*": "×", "/": "÷" };
const OPERATORS = Object.keys(SYMBOLS);
const MAX_DIGITS = 15;
const MAX_HISTORY = 8;

let expr = "";             // raw expression, for example "12+3.5*2"
let justEvaluated = false; // true right after pressing "="
let hasError = false;
let errorMsg = "";

const isOperator = (ch) => OPERATORS.includes(ch);
const lastNumber = () => expr.match(/\d*\.?\d*$/)[0];

/* ---------- storage (history + stats) ---------- */

function load(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch (err) {
    return fallback;
  }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) { /* storage unavailable */ }
}

let history = load("calcHistory", []);
let count = load("calcCount", 0);

function recordCalculation(expression, result) {
  history.unshift({ expression, result });
  history = history.slice(0, MAX_HISTORY);
  count += 1;
  save("calcHistory", history);
  save("calcCount", count);
  renderDashboard();
}

function renderDashboard() {
  statCount.textContent = count;
  statLast.textContent = history.length ? history[0].result : "-";

  historyList.innerHTML = "";
  if (history.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No calculations yet. Try one!";
    historyList.appendChild(li);
    return;
  }
  history.forEach((item) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "history-item";
    btn.type = "button";
    btn.title = "Use this result";
    const left = document.createElement("span");
    left.textContent = item.expression;
    const right = document.createElement("strong");
    right.textContent = item.result;
    btn.append(left, right);
    btn.addEventListener("click", () => useResult(item.result));
    li.appendChild(btn);
    historyList.appendChild(li);
  });
}

/* ---------- display helpers ---------- */

// "12+3*2" -> "12 + 3 × 2"
function prettify(text) {
  return text.replace(/([\d.])([+\-*/])/g, (_, num, op) => `${num} ${SYMBOLS[op]} `);
}

function render() {
  const text = hasError ? errorMsg : expr === "" ? "0" : prettify(expr);
  currentEl.textContent = text;
  currentEl.classList.toggle("error", hasError);
  currentEl.classList.toggle("long", !hasError && text.length > 12);
}

// Rounds floating point noise (0.1 + 0.2) and avoids exponent notation
function format(n) {
  if (!isFinite(n) || Math.abs(n) >= 1e15) throw new Error("Number too large");
  const s = parseFloat(n.toPrecision(12)).toString();
  return s.includes("e") ? n.toFixed(12).replace(/\.?0+$/, "") : s;
}

/* ---------- calculation (no eval) ---------- */

function evaluate(src) {
  const tokens = src.match(/\d+\.?\d*|[+\-*/]/g);
  if (!tokens) throw new Error("Invalid input");
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function factor() {
    if (peek() === "-") { next(); return -factor(); }
    return parseFloat(next());
  }
  function term() {                      // * and / first (operator precedence)
    let value = factor();
    while (peek() === "*" || peek() === "/") {
      const op = next();
      const right = factor();
      if (op === "/") {
        if (right === 0) throw new Error("Cannot divide by 0");
        value /= right;
      } else {
        value *= right;
      }
    }
    return value;
  }
  function expression() {                // then + and -
    let value = term();
    while (peek() === "+" || peek() === "-") {
      const op = next();
      const right = term();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  }
  return expression();
}

/* ---------- input handlers ---------- */

function clearIfFinished() {
  if (justEvaluated || hasError) {
    expr = "";
    exprLine.textContent = "";
    justEvaluated = false;
    hasError = false;
  }
}

function inputDigit(d) {
  clearIfFinished();
  const num = lastNumber();
  if (num.replace(".", "").length >= MAX_DIGITS) return;
  if (num === "0") expr = expr.slice(0, -1);   // avoid leading zeros like 05
  expr += d;
  render();
}

function inputDecimal() {
  clearIfFinished();
  const num = lastNumber();
  if (num.includes(".")) return;               // only one dot per number
  expr += num === "" ? "0." : ".";
  render();
}

function inputOperator(op) {
  if (hasError) return;
  justEvaluated = false;                       // keep working with the last result
  if (expr === "") {
    if (op === "-") expr = "-";                // allow a negative first number
    render();
    return;
  }
  if (expr === "-") return;
  if (isOperator(expr.slice(-1))) expr = expr.slice(0, -1); // replace the last operator
  expr += op;
  render();
}

function percent() {
  if (hasError) return;
  const num = lastNumber();
  if (!num) return;
  const value = parseFloat((parseFloat(num) / 100).toPrecision(12));
  expr = expr.slice(0, expr.length - num.length) + format(value);
  justEvaluated = false;
  render();
}

function backspace() {
  if (hasError || justEvaluated) return clearAll();
  expr = expr.slice(0, -1);
  render();
}

function clearAll() {
  expr = "";
  justEvaluated = false;
  hasError = false;
  exprLine.textContent = "";
  render();
}

function useResult(value) {                    // load a result from history
  expr = value;
  justEvaluated = true;
  hasError = false;
  exprLine.textContent = "";
  render();
}

function calculate() {
  if (hasError || expr === "") return;
  let source = expr;
  while (source && (isOperator(source.slice(-1)) || source.slice(-1) === ".")) {
    source = source.slice(0, -1);              // drop a trailing operator or dot
  }
  if (source === "" || source === "-") return;
  try {
    const result = format(evaluate(source));
    const pretty = prettify(source);
    exprLine.textContent = pretty + " =";
    expr = result;
    justEvaluated = true;
    recordCalculation(pretty, result);
  } catch (err) {
    expr = "";
    hasError = true;
    errorMsg = err.message;
    exprLine.textContent = "";
  }
  render();
}

/* ---------- events ---------- */

keys.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const { num, op, action } = btn.dataset;

  if (num !== undefined) inputDigit(num);
  else if (op) inputOperator(op);
  else if (action === "decimal") inputDecimal();
  else if (action === "percent") percent();
  else if (action === "backspace") backspace();
  else if (action === "clear") clearAll();
  else if (action === "equals") calculate();
});

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;

  if (/^\d$/.test(k)) inputDigit(k);
  else if (isOperator(k)) inputOperator(k);
  else if (k === "." || k === ",") inputDecimal();
  else if (k === "%") percent();
  else if (k === "Enter" || k === "=") { e.preventDefault(); calculate(); }
  else if (k === "Backspace") backspace();
  else if (k === "Escape" || k.toLowerCase() === "c") clearAll();
});

clearHistoryBtn.addEventListener("click", () => {
  history = [];
  count = 0;
  save("calcHistory", history);
  save("calcCount", count);
  renderDashboard();
});

document.getElementById("year").textContent = new Date().getFullYear();
render();
renderDashboard();