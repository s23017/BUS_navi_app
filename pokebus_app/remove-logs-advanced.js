const fs = require('fs');
const path = require('path');

// TypeScript AST parser（手作りの簡単なパーサー）
function removeConsoleLogs(content) {
  // 行ごとに処理
  const lines = content.split('\n');
  const result = [];
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // console.logで始まる行をチェック
    if (trimmedLine.startsWith('console.log(') || 
        trimmedLine.startsWith('console.error(') ||
        trimmedLine.startsWith('console.warn(') ||
        trimmedLine.includes('console.log(')) {
      
      // 複数行にまたがるconsole.logの場合
      let openParens = (line.match(/\(/g) || []).length;
      let closeParens = (line.match(/\)/g) || []).length;
      
      // 開始行をスキップ
      i++;
      
      // 括弧が閉じられるまで行をスキップ
      while (i < lines.length && openParens > closeParens) {
        const currentLine = lines[i];
        openParens += (currentLine.match(/\(/g) || []).length;
        closeParens += (currentLine.match(/\)/g) || []).length;
        i++;
      }
    } else {
      result.push(line);
      i++;
    }
  }
  
  // 連続する空行を削除
  let cleanedResult = [];
  let lastWasEmpty = false;
  
  for (const line of result) {
    const isEmpty = line.trim() === '';
    if (isEmpty && lastWasEmpty) {
      continue; // 連続する空行をスキップ
    }
    cleanedResult.push(line);
    lastWasEmpty = isEmpty;
  }
  
  return cleanedResult.join('\n');
}

// ファイルを処理
const filePath = './src/app/search/page.tsx';
const content = fs.readFileSync(filePath, 'utf8');
const cleanContent = removeConsoleLogs(content);

fs.writeFileSync(filePath, cleanContent);
console.log('console.logの削除が完了しました（複数行対応）。');
