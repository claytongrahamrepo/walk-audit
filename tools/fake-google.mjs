// A small imitation of the Google services that backend/Code.gs uses, so the
// real script can run on this computer for testing. It imitates the parts of
// Sheets that matter to the script:
//   - a cell set to plain text ("@") keeps its text as typed
//   - without that, "=1+1" runs as a formula and "11-13" becomes a date
//   - a leading apostrophe marks text and is not kept
//   - writing outside the sheet's rows or columns is an error
// It is an approximation. Google's own behavior is only proven by running
// selfTest() in the real script editor.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  each(fn) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) fn(this.r + i, this.c + j, i, j); return this; }
  getValues() { const out = []; this.each((r, c, i) => { (out[i] = out[i] || []).push(this.sh.get(r, c)); }); return out; }
  setValues(v) { return this.each((r, c, i, j) => this.sh.set(r, c, v[i][j])); }
  setNumberFormat(f) { return this.each((r, c) => { this.sh.formats[r + ',' + c] = f; }); }
  setNumberFormats(f) { return this.each((r, c, i, j) => { this.sh.formats[r + ',' + c] = f[i][j]; }); }
  setFontWeight() { return this; }
}

class Sheet {
  constructor(name, maxRows) { this.name = name; this.cells = []; this.formats = {}; this.maxCols = 26; this.maxRows = maxRows; }
  get(r, c) { const row = this.cells[r - 1]; const v = row ? row[c - 1] : undefined; return v === undefined ? '' : v; }
  set(r, c, v) {
    while (this.cells.length < r) this.cells.push([]);
    const row = this.cells[r - 1];
    while (row.length < c) row.push('');
    const text = this.formats[r + ',' + c] === '@';
    if (typeof v === 'string') {
      if (v[0] === "'") v = v.slice(1);
      else if (!text && v[0] === '=') v = v === '=1+1' ? 2 : '#FORMULA';
      else if (!text && /^\d{1,2}-\d{1,2}$/.test(v)) v = new Date(2026, Number(v.split('-')[0]) - 1, Number(v.split('-')[1]));
    }
    row[c - 1] = v;
  }
  getLastRow() { let n = this.cells.length; while (n > 0 && this.cells[n - 1].every((x) => x === '')) n--; return n; }
  getLastColumn() { let m = 0; for (const row of this.cells) { let n = row.length; while (n > 0 && row[n - 1] === '') n--; m = Math.max(m, n); } return m; }
  getMaxColumns() { return this.maxCols; }
  getMaxRows() { return this.maxRows; }
  insertColumnsAfter(c, n) { this.maxCols += n; }
  insertRowsAfter(r, n) { this.maxRows += n; }
  setFrozenRows() {}
  getRange(r, c, nr = 1, nc = 1) {
    if (r < 1 || c < 1 || r + nr - 1 > this.maxRows || c + nc - 1 > this.maxCols) throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
    return new Range(this, r, c, nr, nc);
  }
  getDataRange() { return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  deleteRow(r) { this.cells.splice(r - 1, 1); }
  objects() {
    const v = this.getDataRange().getValues(), h = v[0] || [];
    return v.slice(1).map((row) => Object.fromEntries(h.map((k, i) => [k, row[i] instanceof Date ? row[i].toISOString() : row[i]])));
  }
}

function iter(list) { let i = 0; return { hasNext: () => i < list.length, next: () => list[i++] }; }

export function loadBackend(codePath, { photoDir, maxRows = 1000, key = 'test' } = {}) {
  const sheets = new Map();
  const ss = {
    getSheetByName: (n) => sheets.get(n) || null,
    insertSheet: (n) => { const s = new Sheet(n, maxRows); sheets.set(n, s); return s; }
  };
  const folders = new Map();
  const mkFolder = (name) => {
    const files = [];
    const f = {
      name, files,
      getFilesByName: (n) => iter(files.filter((x) => x.name === n && !x.trashed)),
      createFile: (blob) => {
        const file = { name: blob.name, trashed: false, setTrashed(t) { this.trashed = t; }, getUrl: () => 'file://' + path.join(photoDir || '/nowhere', blob.name) };
        if (photoDir) { fs.mkdirSync(photoDir, { recursive: true }); fs.writeFileSync(path.join(photoDir, blob.name), blob.bytes); }
        files.push(file);
        return file;
      }
    };
    folders.set(name, f);
    return f;
  };
  const logs = [];
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ content: s, setMimeType() { return this; } }) },
    DriveApp: { getFoldersByName: (n) => iter(folders.has(n) ? [folders.get(n)] : []), createFolder: mkFolder },
    Utilities: { base64Decode: (b) => Buffer.from(b, 'base64'), newBlob: (bytes, type, name) => ({ bytes, type, name }) },
    Logger: { log: (m) => logs.push(String(m)) },
    Date, JSON, Math, Object, String, Number, Array, Error, RegExp, isFinite
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(codePath, 'utf8'), ctx, { filename: 'Code.gs' });
  ctx.KEY = key;
  return {
    ctx, sheets, folders, logs,
    get: (params) => JSON.parse(ctx.doGet({ parameter: params }).content),
    post: (body) => JSON.parse(ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).content),
    dump: () => Object.fromEntries([...sheets].map(([n, s]) => [n, s.objects()]))
  };
}
