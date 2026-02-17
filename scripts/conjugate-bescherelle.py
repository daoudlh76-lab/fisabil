#!/usr/bin/env python3
"""
Conjugateur arabe - Corrige les 17 031 verbes du Bescherelle Qutrub.

Stratégie :
- Formes II-X : règles morphologiques (très régulières)
- Forme I : dictionnaire de référence + fallback AI

L'ordre Unicode pour l'arabe : lettre + shadda + voyelle (0x651 avant 0x64E/0x64F/0x650)
"""

import json
import re
import sys
import os
import time
from pathlib import Path

# ── Diacritics constants ──
FATHA  = '\u064E'  # َ
DAMMA  = '\u064F'  # ُ
KASRA  = '\u0650'  # ِ
SUKUN  = '\u0652'  # ْ
SHADDA = '\u0651'  # ّ

# Correct order: shadda THEN vowel
def shd(vowel: str) -> str:
    """Shadda + vowel in correct Unicode order."""
    return SHADDA + vowel

# All diacritics regex
DIACRITICS_RE = re.compile(r'[\u064B-\u065F\u0670]')

def strip_all(w: str) -> str:
    """Remove all diacritics."""
    return DIACRITICS_RE.sub('', w)

def strip_keep_shadda(w: str) -> str:
    """Remove diacritics but keep shadda."""
    return re.sub(r'[\u064B-\u0650\u0652-\u065F\u0670]', '', w)

def normalize_diacritics(w: str) -> str:
    """Ensure shadda always comes before vowel (Unicode canonical order)."""
    # Replace vowel+shadda with shadda+vowel
    w = re.sub(r'([\u064E\u064F\u0650])(\u0651)', r'\2\1', w)
    return w

def extract_chars(word: str) -> list:
    """Split word into [(letter, diacritics), ...] pairs."""
    result = []
    for ch in word:
        if DIACRITICS_RE.match(ch):
            if result:
                result[-1] = (result[-1][0], result[-1][1] + ch)
        else:
            result.append((ch, ''))
    return result


# ═══════════════════════════════════════════════════════════════
# FORM DETECTION
# ═══════════════════════════════════════════════════════════════

def detect_form(past: str) -> str:
    """Detect Arabic verb form from past 3ms."""
    bare = strip_all(past)
    n = len(bare)
    has_sh = SHADDA in past

    # Form X: اِسْتَفْعَلَ
    if bare.startswith('است') and n >= 5:
        return 'X'

    # Form VII: اِنْفَعَلَ
    if bare.startswith('ان') and n >= 5 and bare[2] != 'ت':
        return 'VII'

    # Form VIII: اِفْتَعَلَ (3rd letter is ت)
    if bare.startswith('ا') and n >= 5 and bare[2] == 'ت':
        return 'VIII'
    if bare.startswith('ائ') and n >= 5 and len(bare) > 2 and bare[2] == 'ت':
        return 'VIII'

    # Form V: تَفَعَّلَ (starts with ت, has shadda)
    if bare.startswith('ت') and has_sh and n <= 5:
        return 'V'

    # Form VI: تَفَاعَلَ (starts with ت, has alef in position 3)
    if bare.startswith('ت') and n >= 5 and bare[2] in 'اآ':
        return 'VI'

    # Form IV: أَفْعَلَ (starts with أ, 4 letters)
    if n == 4 and bare.startswith('أ'):
        return 'IV'

    # Form III: فَاعَلَ (2nd letter is alef, 4 letters)
    if n == 4 and bare[1] in 'اآ':
        return 'III'

    # Form II: فَعَّلَ (3 letters with shadda)
    if n == 3 and has_sh:
        return 'II'

    # Form I doubled: فَعَّ (2 letters with shadda: مَدَّ)
    if n == 2 and has_sh:
        return 'I'

    # Form I: فَعَلَ (3 letters, no shadda)
    if n == 3 and not has_sh:
        return 'I'

    # Form IX: اِفْعَلَّ (5 letters starting with ا, ends with shadda)
    if bare.startswith('ا') and n == 4 and has_sh:
        return 'IX'

    # Quadriliteral: 4 letters, no standard prefix
    if n == 4 and not bare.startswith('أ') and bare[1] not in 'اآ':
        return 'QI'

    # Longer derived forms with ت prefix
    if bare.startswith('ت') and n >= 5:
        if has_sh:
            return 'V'
        return 'VI'

    # Forms starting with ا but longer
    if bare.startswith('ا') and n >= 5:
        if bare[2] == 'ت':
            return 'VIII'
        return 'VII'  # or other derived

    return 'unknown'


# ═══════════════════════════════════════════════════════════════
# DERIVED FORMS CONJUGATION (II-X) - Regular patterns
# ═══════════════════════════════════════════════════════════════

def conjugate_form_II(past: str) -> tuple:
    """فَعَّلَ → يُفَعِّلُ → فَعِّلْ"""
    bare = strip_all(past)

    if len(bare) == 2:
        # Doubled root with form II shadda: أَبَّ
        r1 = bare[0]
        r2 = bare[1]
        present = f'يُ{r1}{FATHA}{r2}{shd(KASRA)}{r2}{DAMMA}'
        imp = f'{r1}{FATHA}{r2}{shd(KASRA)}{r2}{SUKUN}'
        return (present, imp)

    r1 = bare[0]
    r2 = bare[1]
    r3 = bare[2]

    # Defective (ends in ى)
    if r3 == 'ى':
        present = f'يُ{r1}{FATHA}{r2}{shd(KASRA)}ي'
        imp = f'{r1}{FATHA}{r2}{shd(KASRA)}'
        return (present, imp)

    present = f'يُ{r1}{FATHA}{r2}{shd(KASRA)}{r3}{DAMMA}'
    imp = f'{r1}{FATHA}{r2}{shd(KASRA)}{r3}{SUKUN}'
    return (present, imp)


def conjugate_form_III(past: str) -> tuple:
    """فَاعَلَ → يُفَاعِلُ → فَاعِلْ"""
    bare = strip_all(past)

    if len(bare) < 4:
        return (past, past)

    r1 = bare[0]
    # bare[1] = ا
    r2 = bare[2]
    r3 = bare[3]

    # Defective
    if r3 in 'ىي':
        present = f'يُ{r1}{FATHA}ا{r2}{KASRA}ي'
        imp = f'{r1}{FATHA}ا{r2}{KASRA}'
        return (present, imp)

    present = f'يُ{r1}{FATHA}ا{r2}{KASRA}{r3}{DAMMA}'
    imp = f'{r1}{FATHA}ا{r2}{KASRA}{r3}{SUKUN}'
    return (present, imp)


def conjugate_form_IV(past: str) -> tuple:
    """أَفْعَلَ → يُفْعِلُ → أَفْعِلْ"""
    bare = strip_all(past)
    root = bare[1:]  # Remove أ

    if len(root) < 3:
        # Quadriliteral-like or short
        return (past, past)

    r1 = root[0]
    r2 = root[1]
    r3 = root[2]

    # Defective (ends in ى/ي)
    if r3 in 'ىي':
        present = f'يُ{r1}{SUKUN}{r2}{KASRA}ي'
        imp = f'أَ{r1}{SUKUN}{r2}{KASRA}'
        return (present, imp)

    # Hollow (middle weak: أقام → يُقيم)
    if r2 in 'اوي':
        present = f'يُ{r1}{KASRA}ي{r3}{DAMMA}'
        imp = f'أَ{r1}{KASRA}{r3}{SUKUN}'
        return (present, imp)

    present = f'يُ{r1}{SUKUN}{r2}{KASRA}{r3}{DAMMA}'
    imp = f'أَ{r1}{SUKUN}{r2}{KASRA}{r3}{SUKUN}'
    return (present, imp)


def conjugate_form_V(past: str) -> tuple:
    """تَفَعَّلَ → يَتَفَعَّلُ → تَفَعَّلْ"""
    chars = extract_chars(past)

    # Present = يَ + past with damma on last letter
    present_parts = ['ي', FATHA]
    for i, (ch, dia) in enumerate(chars):
        if i == len(chars) - 1:
            # Last letter: replace final vowel with damma
            present_parts.append(ch + DAMMA)
        else:
            present_parts.append(ch + dia)
    present = ''.join(present_parts)

    # Imperative = past with sukun on last letter
    imp_parts = []
    for i, (ch, dia) in enumerate(chars):
        if i == len(chars) - 1:
            imp_parts.append(ch + SUKUN)
        else:
            imp_parts.append(ch + dia)
    imp = ''.join(imp_parts)

    return (present, imp)


def conjugate_form_VI(past: str) -> tuple:
    """تَفَاعَلَ → يَتَفَاعَلُ → تَفَاعَلْ"""
    # Same pattern as V
    return conjugate_form_V(past)


def conjugate_form_VII(past: str) -> tuple:
    """اِنْفَعَلَ → يَنْفَعِلُ → اِنْفَعِلْ"""
    bare = strip_all(past)

    if not bare.startswith('ان') or len(bare) < 5:
        # Fallback
        return best_effort_prefix_verb(past, 'ان')

    root = bare[2:]  # فعل part
    r1 = root[0]
    r2 = root[1]
    r3 = root[2] if len(root) > 2 else ''

    if not r3:
        # Doubled: انفتّ
        present = f'يَن{SUKUN}{r1}{FATHA}{r2}{shd(DAMMA)}'
        imp = f'اِن{SUKUN}{r1}{FATHA}{r2}{shd(SUKUN)}'
        return (present, imp)

    # Defective
    if r3 in 'ىي':
        present = f'يَن{SUKUN}{r1}{FATHA}{r2}{KASRA}ي'
        imp = f'اِن{SUKUN}{r1}{FATHA}{r2}{KASRA}'
        return (present, imp)

    present = f'يَن{SUKUN}{r1}{FATHA}{r2}{KASRA}{r3}{DAMMA}'
    imp = f'اِن{SUKUN}{r1}{FATHA}{r2}{KASRA}{r3}{SUKUN}'
    return (present, imp)


def conjugate_form_VIII(past: str) -> tuple:
    """اِفْتَعَلَ → يَفْتَعِلُ → اِفْتَعِلْ"""
    bare = strip_all(past)

    # Handle ائتعل pattern
    if bare.startswith('ائ'):
        r1_display = 'ئ'
        inner = bare[3:]  # عل (after ائت)
    elif bare.startswith('ا'):
        r1_display = bare[1]
        inner = bare[3:]  # عل (after افت)
    else:
        return (past, past)

    if len(inner) < 2:
        return (past, past)

    r2 = inner[0]
    r3 = inner[1] if len(inner) > 1 else ''

    # The ت in position 3
    ta = bare[2] if len(bare) > 2 else 'ت'

    if not r3:
        # Doubled
        present = f'يَ{r1_display}{SUKUN}{ta}{FATHA}{r2}{shd(DAMMA)}'
        imp = f'اِ{r1_display}{SUKUN}{ta}{FATHA}{r2}{shd(SUKUN)}'
        return (present, imp)

    # Defective
    if r3 in 'ىي':
        present = f'يَ{r1_display}{SUKUN}{ta}{FATHA}{r2}{KASRA}ي'
        imp = f'اِ{r1_display}{SUKUN}{ta}{FATHA}{r2}{KASRA}'
        return (present, imp)

    # Hollow (middle weak: احتاج)
    if r2 in 'اوي':
        present = f'يَ{r1_display}{SUKUN}{ta}{FATHA}ا{r3}{DAMMA}'
        imp = f'اِ{r1_display}{SUKUN}{ta}{FATHA}{r3}{SUKUN}'
        return (present, imp)

    present = f'يَ{r1_display}{SUKUN}{ta}{FATHA}{r2}{KASRA}{r3}{DAMMA}'
    imp = f'اِ{r1_display}{SUKUN}{ta}{FATHA}{r2}{KASRA}{r3}{SUKUN}'
    return (present, imp)


def conjugate_form_X(past: str) -> tuple:
    """اِسْتَفْعَلَ → يَسْتَفْعِلُ → اِسْتَفْعِلْ"""
    bare = strip_all(past)

    if not bare.startswith('است') or len(bare) < 5:
        return (past, past)

    root = bare[3:]  # فعل part

    if len(root) >= 3:
        r1 = root[0]
        r2 = root[1]
        r3 = root[2]

        # Defective
        if r3 in 'ىي':
            present = f'يَس{SUKUN}تَ{r1}{SUKUN}{r2}{KASRA}ي'
            imp = f'اِس{SUKUN}تَ{r1}{SUKUN}{r2}{KASRA}'
            return (present, imp)

        # Hollow (استطاع → يستطيع)
        if r2 in 'اوي':
            present = f'يَس{SUKUN}تَ{r1}{KASRA}ي{r3}{DAMMA}'
            imp = f'اِس{SUKUN}تَ{r1}{KASRA}{r3}{SUKUN}'
            return (present, imp)

        present = f'يَس{SUKUN}تَ{r1}{SUKUN}{r2}{KASRA}{r3}{DAMMA}'
        imp = f'اِس{SUKUN}تَ{r1}{SUKUN}{r2}{KASRA}{r3}{SUKUN}'
        return (present, imp)

    elif len(root) == 2:
        # Doubled: استمدّ
        r1 = root[0]
        r2 = root[1]
        present = f'يَس{SUKUN}تَ{r1}{KASRA}{r2}{shd(DAMMA)}'
        imp = f'اِس{SUKUN}تَ{r1}{KASRA}{r2}{shd(SUKUN)}'
        return (present, imp)

    return (past, past)


def conjugate_form_IX(past: str) -> tuple:
    """اِفْعَلَّ → يَفْعَلُّ → اِفْعَلِلْ (colors/defects)"""
    bare = strip_all(past)
    if bare.startswith('ا'):
        root = bare[1:]
    else:
        root = bare

    if len(root) >= 3:
        r1 = root[0]
        r2 = root[1]
        r3 = root[2]
        present = f'يَ{r1}{SUKUN}{r2}{FATHA}{r3}{shd(DAMMA)}'
        imp = f'اِ{r1}{SUKUN}{r2}{FATHA}{r3}{shd(SUKUN)}'
        return (present, imp)
    return (past, past)


def conjugate_quadriliteral(past: str) -> tuple:
    """فَعْلَلَ → يُفَعْلِلُ → فَعْلِلْ"""
    bare = strip_all(past)
    if len(bare) >= 4:
        r1, r2, r3, r4 = bare[0], bare[1], bare[2], bare[3]
        present = f'يُ{r1}{FATHA}{r2}{SUKUN}{r3}{KASRA}{r4}{DAMMA}'
        imp = f'{r1}{FATHA}{r2}{SUKUN}{r3}{KASRA}{r4}{SUKUN}'
        return (present, imp)
    return (past, past)


def best_effort_prefix_verb(past: str, prefix: str) -> tuple:
    """Fallback for prefix verbs."""
    chars = extract_chars(past)

    present_parts = ['ي', FATHA]
    for i, (ch, dia) in enumerate(chars):
        if i == 0 and ch == 'ا':
            continue  # Skip leading alef
        if i == len(chars) - 1:
            present_parts.append(ch + DAMMA)
        else:
            present_parts.append(ch + dia)
    present = ''.join(present_parts)

    imp = past
    return (present, imp)


# ═══════════════════════════════════════════════════════════════
# FORM I - Needs special handling (irregular vowel patterns)
# ═══════════════════════════════════════════════════════════════

# Known Form I verbs with correct conjugations
# This dictionary will be populated from verb-reference.ts and expanded
FORM_I_KNOWN = {
    # فَعَلَ - يَفْعُلُ (a-u)
    'كَتَبَ': ('يَكْتُبُ', 'اُكْتُبْ'),
    'خَرَجَ': ('يَخْرُجُ', 'اُخْرُجْ'),
    'دَخَلَ': ('يَدْخُلُ', 'اُدْخُلْ'),
    'نَظَرَ': ('يَنْظُرُ', 'اُنْظُرْ'),
    'نَشَرَ': ('يَنْشُرُ', 'اُنْشُرْ'),
    'طَلَبَ': ('يَطْلُبُ', 'اُطْلُبْ'),
    'كَبُرَ': ('يَكْبُرُ', 'اُكْبُرْ'),
    'صَغُرَ': ('يَصْغُرُ', 'اُصْغُرْ'),
    'حَسُنَ': ('يَحْسُنُ', 'اُحْسُنْ'),
    'قَتَلَ': ('يَقْتُلُ', 'اُقْتُلْ'),
    'سَكَنَ': ('يَسْكُنُ', 'اُسْكُنْ'),
    'عَبَدَ': ('يَعْبُدُ', 'اُعْبُدْ'),
    'تَرَكَ': ('يَتْرُكُ', 'اُتْرُكْ'),
    'حَصَلَ': ('يَحْصُلُ', 'اُحْصُلْ'),

    # فَعَلَ - يَفْعِلُ (a-i)
    'جَلَسَ': ('يَجْلِسُ', 'اِجْلِسْ'),
    'ضَرَبَ': ('يَضْرِبُ', 'اِضْرِبْ'),
    'عَرَفَ': ('يَعْرِفُ', 'اِعْرِفْ'),
    'حَسَبَ': ('يَحْسِبُ', 'اِحْسِبْ'),
    'رَجَعَ': ('يَرْجِعُ', 'اِرْجِعْ'),
    'نَزَلَ': ('يَنْزِلُ', 'اِنْزِلْ'),

    # فَعَلَ - يَفْعَلُ (a-a) - mostly with throat letters
    'ذَهَبَ': ('يَذْهَبُ', 'اِذْهَبْ'),
    'فَتَحَ': ('يَفْتَحُ', 'اِفْتَحْ'),
    'نَجَحَ': ('يَنْجَحُ', 'اِنْجَحْ'),
    'مَنَعَ': ('يَمْنَعُ', 'اِمْنَعْ'),
    'جَمَعَ': ('يَجْمَعُ', 'اِجْمَعْ'),
    'قَرَأَ': ('يَقْرَأُ', 'اِقْرَأْ'),
    'سَأَلَ': ('يَسْأَلُ', 'اِسْأَلْ'),
    'صَنَعَ': ('يَصْنَعُ', 'اِصْنَعْ'),
    'قَطَعَ': ('يَقْطَعُ', 'اِقْطَعْ'),
    'وَقَعَ': ('يَقَعُ', 'قَعْ'),
    'دَفَعَ': ('يَدْفَعُ', 'اِدْفَعْ'),
    'رَفَعَ': ('يَرْفَعُ', 'اِرْفَعْ'),
    'وَضَعَ': ('يَضَعُ', 'ضَعْ'),
    'بَدَأَ': ('يَبْدَأُ', 'اِبْدَأْ'),

    # فَعِلَ - يَفْعَلُ (i-a)
    'شَرِبَ': ('يَشْرَبُ', 'اِشْرَبْ'),
    'سَمِعَ': ('يَسْمَعُ', 'اِسْمَعْ'),
    'عَلِمَ': ('يَعْلَمُ', 'اِعْلَمْ'),
    'فَرِحَ': ('يَفْرَحُ', 'اِفْرَحْ'),
    'فَهِمَ': ('يَفْهَمُ', 'اِفْهَمْ'),
    'عَمِلَ': ('يَعْمَلُ', 'اِعْمَلْ'),
    'لَعِبَ': ('يَلْعَبُ', 'اِلْعَبْ'),
    'رَكِبَ': ('يَرْكَبُ', 'اِرْكَبْ'),
    'حَفِظَ': ('يَحْفَظُ', 'اِحْفَظْ'),
    'لَبِسَ': ('يَلْبَسُ', 'اِلْبَسْ'),
    'تَعِبَ': ('يَتْعَبُ', 'اِتْعَبْ'),
    'خَسِرَ': ('يَخْسَرُ', 'اِخْسَرْ'),
    'غَضِبَ': ('يَغْضَبُ', 'اِغْضَبْ'),
    'حَزِنَ': ('يَحْزَنُ', 'اِحْزَنْ'),

    # Form I - Hamzated فاء
    'أَكَلَ': ('يَأْكُلُ', 'كُلْ'),
    'أَخَذَ': ('يَأْخُذُ', 'خُذْ'),
    'أَمَرَ': ('يَأْمُرُ', 'مُرْ'),

    # Form I - Assimilated (واو)
    'وَجَدَ': ('يَجِدُ', 'جِدْ'),
    'وَصَلَ': ('يَصِلُ', 'صِلْ'),
    'وَضَعَ': ('يَضَعُ', 'ضَعْ'),
    'وَعَدَ': ('يَعِدُ', 'عِدْ'),
    'وَلَدَ': ('يَلِدُ', 'لِدْ'),
    'وَقَفَ': ('يَقِفُ', 'قِفْ'),
    'وَصَفَ': ('يَصِفُ', 'صِفْ'),
    'وَرَدَ': ('يَرِدُ', 'رِدْ'),
    'وَهَبَ': ('يَهَبُ', 'هَبْ'),

    # Form I - Hollow (أجوف)
    'قَالَ': ('يَقُولُ', 'قُلْ'),
    'كَانَ': ('يَكُونُ', 'كُنْ'),
    'قَامَ': ('يَقُومُ', 'قُمْ'),
    'عَادَ': ('يَعُودُ', 'عُدْ'),
    'دَارَ': ('يَدُورُ', 'دُرْ'),
    'طَارَ': ('يَطِيرُ', 'طِرْ'),
    'صَارَ': ('يَصِيرُ', 'صِرْ'),
    'سَارَ': ('يَسِيرُ', 'سِرْ'),
    'زَادَ': ('يَزِيدُ', 'زِدْ'),
    'زَارَ': ('يَزُورُ', 'زُرْ'),
    'نَامَ': ('يَنَامُ', 'نَمْ'),
    'خَافَ': ('يَخَافُ', 'خَفْ'),
    'غَابَ': ('يَغِيبُ', 'غِبْ'),
    'فَازَ': ('يَفُوزُ', 'فُزْ'),
    'مَاتَ': ('يَمُوتُ', 'مُتْ'),
    'بَاعَ': ('يَبِيعُ', 'بِعْ'),

    # Form I - Defective (ناقص)
    'رَمَى': ('يَرْمِي', 'اِرْمِ'),
    'مَشَى': ('يَمْشِي', 'اِمْشِ'),
    'بَنَى': ('يَبْنِي', 'اِبْنِ'),
    'هَدَى': ('يَهْدِي', 'اِهْدِ'),
    'دَعَا': ('يَدْعُو', 'اُدْعُ'),
    'رَأَى': ('يَرَى', 'رَ'),
    'بَقِيَ': ('يَبْقَى', 'اِبْقَ'),
    'نَسِيَ': ('يَنْسَى', 'اِنْسَ'),
    'جَرَى': ('يَجْرِي', 'اِجْرِ'),
    'سَعَى': ('يَسْعَى', 'اِسْعَ'),
    'بَكَى': ('يَبْكِي', 'اِبْكِ'),
    'قَضَى': ('يَقْضِي', 'اِقْضِ'),
    'مَضَى': ('يَمْضِي', 'اِمْضِ'),

    # Form I - Doubled (مضعّف)
    'مَدَّ': (f'يَمُد{shd(DAMMA)}', f'مُد{shd(FATHA)}'),
    'رَدَّ': (f'يَرُد{shd(DAMMA)}', f'رُد{shd(FATHA)}'),
    'شَدَّ': (f'يَشُد{shd(DAMMA)}', f'شُد{shd(FATHA)}'),
    'عَدَّ': (f'يَعُد{shd(DAMMA)}', f'عُد{shd(FATHA)}'),
    'حَلَّ': (f'يَحُل{shd(DAMMA)}', f'حُل{shd(FATHA)}'),
    'ضَلَّ': (f'يَضِل{shd(DAMMA)}', f'ضِل{shd(FATHA)}'),
    'ظَلَّ': (f'يَظَل{shd(DAMMA)}', f'ظَل{shd(FATHA)}'),
}


def conjugate_form_I_by_rules(past: str) -> tuple:
    """
    Rule-based conjugation for Form I verbs not in the known dictionary.
    Uses heuristics based on Arabic morphological patterns.
    """
    bare = strip_all(past)
    chars = extract_chars(past)
    n = len(bare)
    has_sh = SHADDA in past

    # ── Doubled (مضعّف): 2 bare letters ──
    if n == 2 and has_sh:
        r1 = bare[0]
        r2 = bare[1]
        # Default to damma pattern (most common)
        present = f'يَ{r1}{DAMMA}{r2}{shd(DAMMA)}'
        imp = f'{r1}{DAMMA}{r2}{shd(FATHA)}'
        return (present, imp)

    if n != 3:
        return (past, past)

    r1 = bare[0]
    r2 = bare[1]
    r3 = bare[2]

    # ── Hollow (أجوف): middle radical is weak ──
    if r2 in 'اوي':
        # Default to waw pattern
        present = f'يَ{r1}{DAMMA}و{r3}{DAMMA}'
        imp = f'{r1}{DAMMA}{r3}{SUKUN}'
        return (present, imp)

    # ── Defective (ناقص): final radical is weak ──
    if r3 in 'ىي':
        present = f'يَ{r1}{SUKUN}{r2}{KASRA}ي'
        imp = f'اِ{r1}{SUKUN}{r2}{KASRA}'
        return (present, imp)
    if r3 in 'او' and r2 not in 'اوي':
        # Could be defective with alef: دعا → يدعو
        if r3 == 'ا':
            present = f'يَ{r1}{SUKUN}{r2}{DAMMA}و'
            imp = f'اُ{r1}{SUKUN}{r2}{DAMMA}'
            return (present, imp)

    # ── Assimilated (مثال): first radical is و ──
    if r1 == 'و':
        # و usually drops, present takes kasra on عين
        present = f'يَ{r2}{KASRA}{r3}{DAMMA}'
        imp = f'{r2}{KASRA}{r3}{SUKUN}'
        return (present, imp)
    if r1 == 'ي':
        present = f'يَ{r1}{SUKUN}{r2}{FATHA}{r3}{DAMMA}'
        imp = f'اِ{r1}{SUKUN}{r2}{FATHA}{r3}{SUKUN}'
        return (present, imp)

    # ── Hamzated فاء: أكل → يأكل ──
    if r1 in 'أإآء':
        present = f'يَ{r1}{SUKUN}{r2}{DAMMA}{r3}{DAMMA}'
        imp = f'{r2}{DAMMA}{r3}{SUKUN}'
        return (present, imp)

    # ── Sound verb: determine vowel from past ──
    # Get vowel on عين الفعل (2nd radical)
    ayn_vowel = ''
    if len(chars) > 1:
        ayn_vowel = chars[1][1]

    # Throat letters (حروف الحلق) take fatha in present
    THROAT_LETTERS = set('أإآءهعحخغ')

    if DAMMA in ayn_vowel:
        # فَعُلَ → يَفْعُلُ (always damma)
        pv = DAMMA
    elif KASRA in ayn_vowel:
        # فَعِلَ → يَفْعَلُ (mostly fatha)
        pv = FATHA
    else:
        # فَعَلَ → multiple possibilities
        # Heuristic: if عين or لام is throat letter → fatha
        if r2 in THROAT_LETTERS or r3 in THROAT_LETTERS:
            pv = FATHA
        else:
            pv = DAMMA  # Default (most common for فَعَلَ)

    present = f'يَ{r1}{SUKUN}{r2}{pv}{r3}{DAMMA}'

    if pv == DAMMA:
        imp = f'اُ{r1}{SUKUN}{r2}{DAMMA}{r3}{SUKUN}'
    elif pv == KASRA:
        imp = f'اِ{r1}{SUKUN}{r2}{KASRA}{r3}{SUKUN}'
    else:
        imp = f'اِ{r1}{SUKUN}{r2}{FATHA}{r3}{SUKUN}'

    return (present, imp)


# ═══════════════════════════════════════════════════════════════
# MAIN DISPATCHER
# ═══════════════════════════════════════════════════════════════

def conjugate(past: str) -> tuple:
    """Main entry: past 3ms → (present_3ms, imperative)"""
    past = normalize_diacritics(past)
    form = detect_form(past)

    try:
        if form == 'I':
            # Check known dictionary first
            if past in FORM_I_KNOWN:
                return FORM_I_KNOWN[past]
            return conjugate_form_I_by_rules(past)
        elif form == 'II':
            return conjugate_form_II(past)
        elif form == 'III':
            return conjugate_form_III(past)
        elif form == 'IV':
            return conjugate_form_IV(past)
        elif form == 'V':
            return conjugate_form_V(past)
        elif form == 'VI':
            return conjugate_form_VI(past)
        elif form == 'VII':
            return conjugate_form_VII(past)
        elif form == 'VIII':
            return conjugate_form_VIII(past)
        elif form == 'IX':
            return conjugate_form_IX(past)
        elif form == 'X':
            return conjugate_form_X(past)
        elif form in ('QI', 'QII'):
            return conjugate_quadriliteral(past)
        else:
            return conjugate_form_V(past)  # Best effort for تَ- prefix
    except Exception as e:
        print(f"  Error conjugating {past} (form {form}): {e}", file=sys.stderr)
        return (past, past)


# ═══════════════════════════════════════════════════════════════
# VALIDATION
# ═══════════════════════════════════════════════════════════════

KNOWN_CORRECT = {
    'كَتَبَ': ('يَكْتُبُ', 'اُكْتُبْ'),
    'جَلَسَ': ('يَجْلِسُ', 'اِجْلِسْ'),
    'فَتَحَ': ('يَفْتَحُ', 'اِفْتَحْ'),
    'ذَهَبَ': ('يَذْهَبُ', 'اِذْهَبْ'),
    'خَرَجَ': ('يَخْرُجُ', 'اُخْرُجْ'),
    'دَخَلَ': ('يَدْخُلُ', 'اُدْخُلْ'),
    'نَظَرَ': ('يَنْظُرُ', 'اُنْظُرْ'),
    'شَرِبَ': ('يَشْرَبُ', 'اِشْرَبْ'),
    'سَمِعَ': ('يَسْمَعُ', 'اِسْمَعْ'),
    'عَلِمَ': ('يَعْلَمُ', 'اِعْلَمْ'),
    'نَشَرَ': ('يَنْشُرُ', 'اُنْشُرْ'),
    'نَجَحَ': ('يَنْجَحُ', 'اِنْجَحْ'),
    'أَكَلَ': ('يَأْكُلُ', 'كُلْ'),
    'أَخَذَ': ('يَأْخُذُ', 'خُذْ'),
    'قَرَأَ': ('يَقْرَأُ', 'اِقْرَأْ'),
    'وَجَدَ': ('يَجِدُ', 'جِدْ'),
    'وَصَلَ': ('يَصِلُ', 'صِلْ'),
    'وَضَعَ': ('يَضَعُ', 'ضَعْ'),
    'قَالَ': ('يَقُولُ', 'قُلْ'),
    'كَانَ': ('يَكُونُ', 'كُنْ'),
    'نَامَ': ('يَنَامُ', 'نَمْ'),
    'قَامَ': ('يَقُومُ', 'قُمْ'),
    'زَادَ': ('يَزِيدُ', 'زِدْ'),
    'رَمَى': ('يَرْمِي', 'اِرْمِ'),
    'مَشَى': ('يَمْشِي', 'اِمْشِ'),
    'دَعَا': ('يَدْعُو', 'اُدْعُ'),
    'رَأَى': ('يَرَى', 'رَ'),
    'مَدَّ': (f'يَمُد{shd(DAMMA)}', f'مُد{shd(FATHA)}'),
    'رَدَّ': (f'يَرُد{shd(DAMMA)}', f'رُد{shd(FATHA)}'),
    'عَلَّمَ': (f'يُعَل{shd(KASRA)}مُ', f'عَل{shd(KASRA)}مْ'),
    'كَلَّمَ': (f'يُكَل{shd(KASRA)}مُ', f'كَل{shd(KASRA)}مْ'),
    'فَكَّرَ': (f'يُفَك{shd(KASRA)}رُ', f'فَك{shd(KASRA)}رْ'),
    'قَلَّلَ': (f'يُقَل{shd(KASRA)}لُ', f'قَل{shd(KASRA)}لْ'),
    'سَافَرَ': ('يُسَافِرُ', 'سَافِرْ'),
    'حَاوَلَ': ('يُحَاوِلُ', 'حَاوِلْ'),
    'قَابَلَ': ('يُقَابِلُ', 'قَابِلْ'),
    'مَارَسَ': ('يُمَارِسُ', 'مَارِسْ'),
    'أَرْسَلَ': ('يُرْسِلُ', 'أَرْسِلْ'),
    'أَعْطَى': ('يُعْطِي', 'أَعْطِ'),
    'تَعَلَّمَ': (f'يَتَعَل{shd(FATHA)}مُ', f'تَعَل{shd(SUKUN)}مْ'),
    'تَكَلَّمَ': (f'يَتَكَل{shd(FATHA)}مُ', f'تَكَل{shd(SUKUN)}مْ'),
    'تَذَكَّرَ': (f'يَتَذَك{shd(FATHA)}رُ', f'تَذَك{shd(SUKUN)}رْ'),
    'تَبَادَلَ': ('يَتَبَادَلُ', 'تَبَادَلْ'),
    'تَنَاوَلَ': ('يَتَنَاوَلُ', 'تَنَاوَلْ'),
    'اِنْكَسَرَ': ('يَنْكَسِرُ', 'اِنْكَسِرْ'),
    'اِجْتَمَعَ': ('يَجْتَمِعُ', 'اِجْتَمِعْ'),
    'اِشْتَرَى': ('يَشْتَرِي', 'اِشْتَرِ'),
    'اِخْتَلَفَ': ('يَخْتَلِفُ', 'اِخْتَلِفْ'),
    'اِسْتَطَاعَ': ('يَسْتَطِيعُ', 'اِسْتَطِعْ'),
    'اِسْتَخْدَمَ': ('يَسْتَخْدِمُ', 'اِسْتَخْدِمْ'),
    'اِسْتَمَعَ': ('يَسْتَمِعُ', 'اِسْتَمِعْ'),
}


def validate():
    """Test against known correct forms."""
    print("=== Validation ===")
    passed = 0
    failed = 0

    for past, (expected_present, expected_imp) in KNOWN_CORRECT.items():
        form = detect_form(past)
        present, imp = conjugate(past)

        # Normalize both for comparison
        present_n = normalize_diacritics(present)
        imp_n = normalize_diacritics(imp)
        expected_present_n = normalize_diacritics(expected_present)
        expected_imp_n = normalize_diacritics(expected_imp)

        p_ok = present_n == expected_present_n
        i_ok = imp_n == expected_imp_n

        if p_ok and i_ok:
            passed += 1
            print(f"  ✅ {past} ({form})")
        else:
            failed += 1
            if not p_ok:
                print(f"  ❌ {past} ({form}) present: got '{present}' expected '{expected_present}'")
                print(f"     hex got: {[hex(ord(c)) for c in present_n]}")
                print(f"     hex exp: {[hex(ord(c)) for c in expected_present_n]}")
            if not i_ok:
                print(f"  ❌ {past} ({form}) imperative: got '{imp}' expected '{expected_imp}'")
                print(f"     hex got: {[hex(ord(c)) for c in imp_n]}")
                print(f"     hex exp: {[hex(ord(c)) for c in expected_imp_n]}")

    print(f"\n  Results: {passed}/{passed+failed} passed ({failed} failed)")
    return failed == 0


# ═══════════════════════════════════════════════════════════════
# GENERATION
# ═══════════════════════════════════════════════════════════════

def generate():
    """Process all 17,031 verbs and write corrected JSON."""
    input_file = Path(__file__).parent.parent / 'supabase/functions/extract-vocab/bescherelle_arabe_complet.json'
    output_file = Path(__file__).parent.parent / 'supabase/functions/extract-vocab/bescherelle_arabe_corrige.json'

    with open(input_file) as f:
        data = json.load(f)

    print(f"Processing {len(data)} verbs...")

    result = {}
    form_stats = {}

    for past_key in data.keys():
        past = normalize_diacritics(past_key)
        form = detect_form(past)
        form_stats[form] = form_stats.get(form, 0) + 1

        present, imp = conjugate(past)
        present = normalize_diacritics(present)
        imp = normalize_diacritics(imp)

        result[past] = [past, present, imp]

    print("\nForm distribution:")
    for form, count in sorted(form_stats.items(), key=lambda x: -x[1]):
        print(f"  {form}: {count}")

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=None, separators=(',', ':'))

    print(f"\nOutput written to {output_file} ({output_file.stat().st_size / 1024:.1f} KB)")


def main():
    if '--validate' in sys.argv:
        success = validate()
        sys.exit(0 if success else 1)
    elif '--generate' in sys.argv:
        generate()
    else:
        validate()


if __name__ == '__main__':
    main()
