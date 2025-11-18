const fs = require('fs');

// ファイルを読み取り
const filePath = './src/app/search/page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// console.logで始まる行を削除（インデントを考慮）
content = content.replace(/^[ \t]*console\.log\([^)]*\);?\s*$/gm, '');

// 複数行にまたがるconsole.logを削除
content = content.replace(/^[ \t]*console\.log\([^)]*(?:\n[^)]*)*\);?\s*$/gm, '');

// console.errorも削除
content = content.replace(/^[ \t]*console\.error\([^)]*\);?\s*$/gm, '');

// 空行を整理（連続する空行を一つにまとめる）
content = content.replace(/\n{3,}/g, '\n\n');

// ファイルに書き戻し
fs.writeFileSync(filePath, content);

console.log('console.logの削除が完了しました。');
