#!/usr/bin/env python3
import os
import json
from pathlib import Path

def remove_duplicate_json_files(folder1_path, folder2_path):
    """
    2つのフォルダを比較して、同じ名前または同じ内容のJSONファイルがあった場合
    2つ目のフォルダ側を削除する
    
    Args:
        folder1_path (str): 比較対象フォルダ1のパス（保持される）
        folder2_path (str): 比較対象フォルダ2のパス（削除対象）
    """
    # パスを正規化
    folder1 = Path(folder1_path).expanduser().resolve()
    folder2 = Path(folder2_path).expanduser().resolve()
    
    print(f"\nパスチェック:")
    print(f"  フォルダ1（保持）: {folder1}")
    print(f"  存在確認: {folder1.exists()}")
    print(f"  ディレクトリ確認: {folder1.is_dir() if folder1.exists() else 'N/A'}")
    
    print(f"  フォルダ2（削除対象）: {folder2}")
    print(f"  存在確認: {folder2.exists()}")
    print(f"  ディレクトリ確認: {folder2.is_dir() if folder2.exists() else 'N/A'}")
    
    if not folder1.exists():
        print(f"\nエラー: フォルダ1が存在しません: {folder1}")
        return
    
    if not folder1.is_dir():
        print(f"\nエラー: フォルダ1がディレクトリではありません: {folder1}")
        return
        
    if not folder2.exists():
        print(f"\nエラー: フォルダ2が存在しません: {folder2}")
        return
        
    if not folder2.is_dir():
        print(f"\nエラー: フォルダ2がディレクトリではありません: {folder2}")
        return
    
    # 各フォルダのJSONファイル一覧を取得
    folder1_json_files = list(folder1.glob("*.json"))
    folder2_json_files = list(folder2.glob("*.json"))
    
    folder1_names = set(f.name for f in folder1_json_files)
    folder2_names = set(f.name for f in folder2_json_files)
    
    # 名前重複チェック
    name_duplicates = folder1_names.intersection(folder2_names)
    
    # 内容重複チェック用に全ファイルの内容を読み込み
    folder1_contents = {}
    folder2_contents = {}
    
    # フォルダ1のファイル内容を読み込み
    for file_path in folder1_json_files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                folder1_contents[file_path.name] = json.load(f)
        except (json.JSONDecodeError, FileNotFoundError, PermissionError) as e:
            print(f"フォルダ1ファイル読み込みエラー {file_path.name}: {e}")
    
    # フォルダ2のファイル内容を読み込み
    for file_path in folder2_json_files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                folder2_contents[file_path.name] = json.load(f)
        except (json.JSONDecodeError, FileNotFoundError, PermissionError) as e:
            print(f"フォルダ2ファイル読み込みエラー {file_path.name}: {e}")
    
    # 内容重複チェック
    content_duplicates = []
    for f2_name, f2_content in folder2_contents.items():
        for f1_name, f1_content in folder1_contents.items():
            if f2_name != f1_name and f2_content == f1_content:
                content_duplicates.append((f2_name, f1_name))
    
    # 削除対象ファイルの決定
    files_to_delete = []
    
    # 名前重複ファイル
    for filename in name_duplicates:
        files_to_delete.append((filename, f"名前重複: {filename}"))
    
    # 内容重複ファイル
    for f2_name, f1_name in content_duplicates:
        if f2_name not in name_duplicates:  # 既に名前重複で追加済みでない場合
            files_to_delete.append((f2_name, f"内容重複: {f2_name} ⟷ {f1_name}"))
    
    if not files_to_delete:
        print("重複するJSONファイルはありません")
        return
    
    print("\n削除対象ファイル:")
    for filename, reason in files_to_delete:
        print(f"  - {reason}")
    
    # フォルダ2側の重複ファイルを削除
    deleted_count = 0
    for filename, reason in files_to_delete:
        file_to_delete = folder2 / filename
        if file_to_delete.exists():
            try:
                file_to_delete.unlink()
                print(f"削除しました: {file_to_delete} ({reason})")
                deleted_count += 1
            except Exception as e:
                print(f"削除に失敗しました {file_to_delete}: {e}")
    
    print(f"合計 {deleted_count} 個のファイルを削除しました")

if __name__ == "__main__":
    print("=== JSON重複ファイル削除ツール ===")
    print("※ファイル名または内容が重複している場合、2つ目のフォルダから削除されます")
    print(f"\n現在のディレクトリ: {Path.cwd()}")
    print("\nパスの書き方例:")
    print("  絶対パス: /home/s23021/BUS_navi_app/data")
    print("  相対パス: ./data または data")
    print("  現在のディレクトリ: . または空欄でEnter")
    print("  一つ上のディレクトリ: ..")
    print("  ホームディレクトリ: ~/フォルダ名")
    
    # フォルダパスを指定してください
    folder1_input = input("\n1つ目のフォルダのパス（保持される）(空欄で現在のディレクトリ): ").strip()
    folder1_path = folder1_input if folder1_input else "."
    
    folder2_input = input("2つ目のフォルダのパス（削除対象）: ").strip()
    if not folder2_input:
        print("2つ目のフォルダのパスは必須です")
        exit(1)
    
    folder2_path = folder2_input
    
    # パスを絶対パスに変換して表示
    folder1_abs = Path(folder1_path).resolve()
    folder2_abs = Path(folder2_path).resolve()
    
    print(f"\n実際のパス:")
    print(f"  フォルダ1（保持）: {folder1_abs}")
    print(f"  フォルダ2（削除対象）: {folder2_abs}")
    
    confirm = input("\nこのパスで実行しますか? (y/N): ").strip().lower()
    if confirm not in ['y', 'yes']:
        print("キャンセルしました")
        exit(0)
    
    remove_duplicate_json_files(folder1_path, folder2_path)
