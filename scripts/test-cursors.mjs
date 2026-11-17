import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import postcss from "postcss";

const source = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
const root = postcss.parse(source);
const baseRules = [];
root.walkAtRules("layer", layer => {
  if (layer.params === "base") baseRules.push(...layer.nodes.map(node => node.toString()));
});
const dom = new JSDOM(`<!doctype html><style>${baseRules.join("\n")}</style><body></body>`);

function cursor(markup, selector = "body > *") {
  dom.window.document.body.innerHTML = markup;
  return dom.window.getComputedStyle(dom.window.document.querySelector(selector)).cursor;
}

test("active action controls and their selectable labels use a pointer", () => {
  for (const markup of [
    "<button>Action</button>", '<a href="/privacy">Link</a>', "<select></select>",
    "<details><summary>More</summary></details>",
    ...["button", "submit", "reset", "checkbox", "radio", "file", "color", "range"]
      .map(type => `<input type="${type}">`),
    '<div role="button">Action</div>',
    '<label><input type="checkbox">Choice</label>',
    '<label><input type="radio">Choice</label>',
    '<label><input type="file">File</label>',
  ]) {
    assert.equal(cursor(markup, markup.startsWith("<details>") ? "summary" : undefined), "pointer", markup);
  }
});

test("disabled controls do not suggest an available action", () => {
  for (const markup of [
    "<button disabled>Action</button>", "<select disabled></select>",
    '<input type="checkbox" disabled>', '<button aria-disabled="true">Action</button>',
    '<a href="/" aria-disabled="true">Link</a>', '<div role="button" aria-disabled="true">Action</div>',
  ]) assert.equal(cursor(markup), "not-allowed", markup);
  assert.notEqual(cursor('<label><input type="checkbox" disabled>Choice</label>'), "pointer");
  assert.notEqual(cursor('<fieldset disabled><label><input type="radio">Choice</label></fieldset>', "label"), "pointer");
});

test("text entry and ordinary labels do not acquire a pointer", () => {
  for (const markup of [
    "<input>", '<input type="text">', '<input type="email">', '<input type="password">',
    "<textarea></textarea>", '<label>Text<input type="text"></label>', "<a>Not a link</a>",
  ]) assert.notEqual(cursor(markup), "pointer", markup);
});
