# 早見グラフの★（実績を書いてもらう幅）を決める。型ごとのシート（u-chart-sheet.py）とまとめの実績記入（u-summary.py）で
# 同じ★にするため、ここに1つだけ置く。
H_TOP = 300


def graph_range(r):
    """表・グラフに出す幅の範囲"""
    ok = [int(k) for k, v in r['hmax'].items() if v is not None]
    if not ok:
        return 0, 300
    lo = 0 if (r.get('wMin') or 0) < 200 else max(0, int((r['wMin'] - 30) // 50) * 50)
    hi = 300 if (r.get('wMin') or 0) < 200 else min(max(ok), 400)
    return lo, hi


def key_ws(vals, alt_ws=(), nW=None):
    """書いてもらう幅（★）
    ・いちばん狭い幅（ほかのヤゲンも入れた nW と、904061 のいちばん狭い幅）と いちばん広い幅
    ・赤字（幅を広げたのに上限が下がる所）が本当かを実績で確かめるため、赤字のかたまりごとに
      手前の山（赤字の1つ前の行）と谷（赤字のいちばん低い行）（2026-10-14 ユーザー「赤字は本当か実績で検証したい」）
    ・100mm ごと（近すぎるものは省く）"""
    calcs = [(W, v) for W, v in vals if isinstance(v, (int, float))]
    if not calcs:
        return [nW] if nW is not None else []
    keys = [calcs[0][0], calcs[-1][0]] + ([nW] if nW is not None else [])
    red = [i for i in range(1, len(calcs))
           if calcs[i][0] not in alt_ws and calcs[i][1] < calcs[i - 1][1] and calcs[i][0] - calcs[i - 1][0] <= 10]
    runs = []
    for i in red:
        if runs and i == runs[-1][-1] + 1:
            runs[-1].append(i)
        else:
            runs.append([i])
    for run in runs:
        keys.append(calcs[run[0] - 1][0])                            # 山
        keys.append(calcs[min(run, key=lambda i: calcs[i][1])][0])   # 谷
    have = {W for W, _ in calcs}
    for W in ([50] if calcs[0][0] < 40 else []) + list(range(100, calcs[-1][0], 100)):
        if W in have and all(abs(W - k) >= 20 for k in keys):
            keys.append(W)
    return sorted(set(keys))


def no_entry(r, hat):
    """実績はまだ書かない型（2026-10-14 ユーザー「V100以降は実績はとりあえず入れないで行きます」。コの字だけ）"""
    return not hat and r['V'] >= 100


def tag_of(r):
    """型の呼び方：基準金型／小さいV／大きいV（板厚の基準のVと比べて）"""
    return r.get('tag') or ('基準金型' if r.get('base') else '小さいV')


def keys_for(r, hat):
    """その型の★（書いた実績で行が増えても★は動かないよう、実績は入れずに決める）"""
    if no_entry(r, hat):
        return []
    lo, hi = graph_range(r)
    altN = r.get('altNarrow') or {}
    nW = min(map(int, altN)) if altN else None
    hm = dict(r['hmax'])
    if nW is not None:
        hm.setdefault(str(nW), None)
    vals = [(int(k), hm[k]) for k in sorted(hm, key=lambda x: int(x)) if lo <= int(k) <= hi
            and (not hat or int(k) % 10 == 0 or int(k) == r.get('wMin') or int(k) == nW)]
    return key_ws(vals, {int(k) for k in (r.get('alt') or {})} | {int(k) for k in altN}, nW)
