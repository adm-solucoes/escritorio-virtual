#!/usr/bin/env python3
"""Adiciona transição (fade) e animações de entrada ao PPTX gerado pelo build.js.

Convenção: objectName = a{grupo}{tipo}_{rótulo}
  grupo: 1..9, grupos aparecem em sequência automática (sem cliques)
  tipo : f = esmaecer (fade), w = revelar da esquerda (wipe)
Elementos do mesmo grupo entram em cascata curta. Título e kicker ficam estáticos.
"""
import re, sys, zipfile, shutil

src, dst = sys.argv[1], sys.argv[2]
PAT = re.compile(r'<p:cNvPr id="(\d+)" name="a(\d+)([fw])_([^"]*)"')

def effect(cid, spid, kind, delay, first):
    node = "afterEffect" if first else "withEffect"
    if kind == "w":
        preset, sub, flt = 22, 8, "wipe(left)"
    else:
        preset, sub, flt = 10, 0, "fade"
    return (
        f'<p:par><p:cTn id="{cid}" presetID="{preset}" presetClass="entr" presetSubtype="{sub}" fill="hold" nodeType="{node}">'
        f'<p:stCondLst><p:cond delay="{delay}"/></p:stCondLst><p:childTnLst>'
        f'<p:set><p:cBhvr><p:cTn id="{cid+1}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>'
        f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr>'
        f'<p:to><p:strVal val="visible"/></p:to></p:set>'
        f'<p:animEffect transition="in" filter="{flt}"><p:cBhvr><p:cTn id="{cid+2}" dur="{600 if kind=="w" else 450}"/>'
        f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl></p:cBhvr></p:animEffect>'
        f'</p:childTnLst></p:cTn></p:par>'
    )

def timing(items):
    # items: list of (spid, group, kind) in document order
    effs, cid, first = [], 5, True
    seen = {}
    for spid, grp, kind in items:
        k = seen.get(grp, 0); seen[grp] = k + 1
        delay = 250 + (grp - 1) * 550 + k * 70
        effs.append(effect(cid, spid, kind, delay, first))
        cid += 3; first = False
    return (
        '<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>'
        '<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>'
        '<p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst><p:childTnLst>'
        '<p:par><p:cTn id="4" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>'
        + "".join(effs) +
        '</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>'
        '</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>'
        '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>'
        '</p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>'
    )

zin = zipfile.ZipFile(src)
zout = zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED)
total = 0
for item in zin.infolist():
    data = zin.read(item.filename)
    if re.fullmatch(r"ppt/slides/slide\d+\.xml", item.filename):
        x = data.decode("utf-8")
        items = [(int(m.group(1)), int(m.group(2)), m.group(3)) for m in PAT.finditer(x)]
        # ordena por grupo mantendo a ordem do documento dentro do grupo
        items = [it for _, it in sorted(enumerate(items), key=lambda t: (t[1][1], t[0]))]
        add = '<p:transition spd="med"><p:fade/></p:transition>'
        if items:
            add += timing(items)
            total += len(items)
        assert "</p:clrMapOvr>" in x, item.filename
        x = x.replace("</p:clrMapOvr>", "</p:clrMapOvr>" + add, 1)
        data = x.encode("utf-8")
    zout.writestr(item, data)
zout.close()
print("animações:", total)
