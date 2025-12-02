#!/bin/bash
cd "$(dirname "$0")/.."

if [ -d "$1" ]; then
  # ディレクトリが指定された場合、その中のすべてのファイルを処理
  for file in "$1"/*; do
    if [ -f "$file" ]; then
      echo "処理中: $file"
      node command/omas.js "$file"
    fi
  done
else
  # 単一ファイルが指定された場合
  node command/omas.js "$1"
fi
