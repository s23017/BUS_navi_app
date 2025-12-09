import requests
from bs4 import BeautifulSoup
import json

BASE = "http://www.daiichibus.jp/map/"

def fetch_links():
    """地図ページから JSON リンクを自動収集"""
    html = requests.get(BASE).text
    soup = BeautifulSoup(html, "html.parser")
    
    links = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        # TimeTableAll のリンクだけ拾う
        if "TimeTableAll" in href:
            if href.startswith("http"):
                links.append(href)
            else:
                links.append(BASE + href)
    return links


def fetch_json(url):
    """JSON を取得"""
    res = requests.get(url)
    res.raise_for_status()
    return res.json()


# ここから実行 ---------------------------------
links = fetch_links()
print(f"見つかった JSON リンク数: {len(links)}")

for i, url in enumerate(links, 1):
    try:
        data = fetch_json(url)
        filename = f"bus_json_{i}.json"
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"{filename} を保存しました")
    except:
        print(f"取得失敗: {url}")
