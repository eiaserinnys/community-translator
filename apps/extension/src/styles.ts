/**
 * One stylesheet for every card the extension injects. `all: initial` on the host
 * means the community's own CSS cannot reach in, and the dark palette is applied by
 * a data-dark attribute rather than by guessing from the media query alone.
 */
export const CARD_STYLES = `
:host {
  all: initial;
  display: block;
  --ct-bg: #fff;
  --ct-soft: #f5f3ff;
  --ct-text: #24242d;
  --ct-muted: #686875;
  --ct-accent: #6652cc;
  --ct-line: #e4dff1;
  --ct-button: #6e56cf;
  color: var(--ct-text);
  font: 13px/1.55 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  text-align: left;
  color-scheme: light;
}
:host([data-dark]) {
  --ct-bg: #282930;
  --ct-soft: #30313d;
  --ct-text: #eeedf5;
  --ct-muted: #acaaba;
  --ct-accent: #b5a8ef;
  --ct-line: #484454;
  --ct-button: #8870e4;
  color-scheme: dark;
}
* { box-sizing: border-box; }
button, select { font: inherit; }
button { cursor: pointer; }
button:focus-visible, select:focus-visible { outline: 2px solid var(--ct-accent); outline-offset: 3px; }
button:disabled { opacity: .45; cursor: default; }
[hidden] { display: none !important; }

.translation {
  margin: 5px 0 3px;
  display: flex;
  align-items: baseline;
  gap: 8px;
  color: var(--ct-accent);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.translation p { margin: 0; min-width: 0; font-size: 13px; line-height: 1.6; }
.translation button { flex-shrink: 0; border: 0; background: none; color: var(--ct-muted); padding: 0; font-size: 11px; }
.translation.error { color: var(--ct-muted); }
.translation p.clamped {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card {
  margin: 10px 0 8px;
  border: 1px solid var(--ct-line);
  border-radius: 12px;
  background: var(--ct-bg);
  box-shadow: 0 3px 14px #00000008;
  overflow: hidden;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px;
  background: var(--ct-soft);
  flex-wrap: wrap;
}
.brand { display: flex; align-items: center; gap: 7px; color: var(--ct-accent); font-size: 12px; font-weight: 600; }
.brand b { display: inline-grid; place-items: center; width: 30px; height: 23px; border: 1px solid var(--ct-line); border-radius: 7px; font-weight: 600; }
.head label { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--ct-muted); }
select { border: 1px solid var(--ct-line); border-radius: 6px; background: var(--ct-bg); color: var(--ct-text); padding: 3px 6px; font-size: 11px; }
.result { margin: 0; padding: 13px 15px 8px; font-size: 15px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
.result.waiting { color: var(--ct-muted); font-size: 13px; }
.footer { padding: 7px 14px 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.status { color: var(--ct-muted); font-size: 11px; flex: 1; min-width: 120px; }
.actions { display: flex; gap: 6px; flex-wrap: wrap; }
.actions button { padding: 6px 9px; border-radius: 7px; border: 1px solid var(--ct-line); color: var(--ct-text); background: var(--ct-bg); font-size: 12px; }
.actions .primary { background: var(--ct-button); color: #fff; border-color: var(--ct-button); }
.dot { width: 5px; height: 5px; border-radius: 50%; background: var(--ct-accent); display: inline-block; }

@media (pointer: coarse) {
  button, select { min-height: 40px; }
}
`;
