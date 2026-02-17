#!/usr/bin/env python3
"""
Génère un fichier SQL d'insertion pour les 17 031 verbes du Bescherelle arabe.
Usage: python3 scripts/insert-bescherelle.py > /tmp/bescherelle_insert.sql
"""
import json
import re
import sys

DIACRITICS_RE = re.compile(r'[\u064B-\u065F\u0670]')

def strip_diacritics(word):
    return DIACRITICS_RE.sub('', word)

def escape_sql(s):
    return s.replace("'", "''")

with open('supabase/functions/extract-vocab/bescherelle_arabe_complet.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print("-- Bescherelle arabe: {} verbes".format(len(data)))
print("DELETE FROM bescherelle_verbs;")
print()

batch_size = 500
entries = list(data.items())

for i in range(0, len(entries), batch_size):
    batch = entries[i:i+batch_size]
    print("INSERT INTO bescherelle_verbs (passe_3ms, present_3ms, imperatif, passe_norm, present_norm, imperatif_norm) VALUES")
    values = []
    for key, forms in batch:
        passe = forms[0]
        present = forms[1]
        imperatif = forms[2]
        values.append("  ('{}', '{}', '{}', '{}', '{}', '{}')".format(
            escape_sql(passe),
            escape_sql(present),
            escape_sql(imperatif),
            escape_sql(strip_diacritics(passe)),
            escape_sql(strip_diacritics(present)),
            escape_sql(strip_diacritics(imperatif))
        ))
    print(',\n'.join(values) + ';')
    print()

print("-- Done: {} verbs inserted".format(len(entries)))
