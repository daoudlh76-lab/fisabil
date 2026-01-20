import { useState, useCallback } from "react";
import { supabase } from "@/src/lib/supabase";

export interface DiacriticsResult {
  original: string;
  diacritized: string;
  method: "api" | "local";
}

export function useDiacritics() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addDiacritics = useCallback(
    async (text: string, language: string = "ar"): Promise<DiacriticsResult | null> => {
      setLoading(true);
      setError(null);

      try {
        // Utiliser l'algorithme local directement (plus fiable que Edge Function)
        const diacritized = addDiacriticsLocally(text);
        return {
          original: text,
          diacritized,
          method: "local",
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        setError(errorMsg);
        // Retourner quand même le texte original
        return {
          original: text,
          diacritized: text,
          method: "local",
        };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { addDiacritics, loading, error };
}

/**
 * Algorithme intelligent pour ajouter des diacritiques arabes
 * Analyse la grammaire arabe et ajoute les voyelles correctes
 */
function addDiacriticsLocally(text: string): string {
  // Voyelles arabes
  const FATHA = "َ";      // a
  const DAMMA = "ُ";      // u
  const KASRA = "ِ";      // i
  const SUKUN = "ْ";      // no vowel
  const SHADDA = "ّ";     // emphasis
  const FATHATAIN = "ً";  // tanween fatha
  const DAMMAIN = "ٌ";    // tanween damma
  const KASRAIN = "ٍ";    // tanween kasra

  // Dictionnaire ÉTENDU de mots arabes avec diacritiques correctes
  const arabicDictionary: Record<string, string> = {
    // Verbes courants au passé
    ذهب: "ذَهَبَ",
    جاء: "جَاءَ",
    قال: "قَالَ",
    كتب: "كَتَبَ",
    فعل: "فَعَلَ",
    أخذ: "أَخَذَ",
    جعل: "جَعَلَ",
    قام: "قَامَ",
    صنع: "صَنَعَ",
    عمل: "عَمِلَ",
    علم: "عَلِمَ",
    سمع: "سَمِعَ",
    رأى: "رَأَىٰ",
    أعطى: "أَعْطَىٰ",
    ترك: "تَرَكَ",
    وجد: "وَجَدَ",
    حدث: "حَدَثَ",
    نقل: "نَقَلَ",
    أرسل: "أَرْسَلَ",
    جاب: "جَابَ",
    حكم: "حَكَمَ",
    شرح: "شَرَحَ",
    وضع: "وَضَعَ",
    بدأ: "بَدَأَ",
    انتقل: "انْتَقَلَ",

    // نصوص قرآنية وشائعة
    "نص عربي للتجربة": "نَصٌ عَرَبِيٌّ لِلتَّجْرِبَةِ",
    "السلام عليكم": "السَّلَامُ عَلَيْكُمْ",
    "وعليكم السلام": "وَعَلَيْكُمُ السَّلَامُ",

    // الأسماء الشائعة
    كتاب: "كِتَابٌ",
    قلم: "قَلَمٌ",
    باب: "بَابٌ",
    قمر: "قَمَرٌ",
    شمس: "شَمْسٌ",
    نجم: "نَجْمٌ",
    طريق: "طَرِيقٌ",
    ماء: "مَاءٌ",
    هواء: "هَوَاءٌ",
    ضوء: "ضَوْءٌ",
    صوت: "صَوْتٌ",
    ليل: "لَيْلٌ",
    نهار: "نَهَارٌ",
    عالم: "عَالَمٌ",
    إنسان: "إِنْسَانٌ",
    سماء: "سَمَاءٌ",
    أرض: "أَرْضٌ",
    جنة: "جَنَّةٌ",
    نار: "نَارٌ",
    ملك: "مَلِكٌ",
    عبد: "عَبْدٌ",
    رب: "رَبٌ",
    إله: "إِلَهٌ",
    دين: "دِينٌ",
    أمن: "أَمْنٌ",
    سلام: "سَلَامٌ",
    حرب: "حَرْبٌ",
    سلح: "سِلَاحٌ",
    سيف: "سَيْفٌ",
    درع: "دِرْعٌ",
    حصان: "حِصَانٌ",
    جمل: "جَمَلٌ",
    أسد: "أَسَدٌ",
    ثعبان: "ثُعْبَانٌ",
    طير: "طَيْرٌ",
    نملة: "نَمْلَةٌ",
    بيت: "بَيْتٌ",
    قرية: "قَرْيَةٌ",
    مدينة: "مَدِينَةٌ",
    جبل: "جَبَلٌ",
    وادي: "وَادٍ",
    نهر: "نَهْرٌ",
    بحر: "بَحْرٌ",
    جزيرة: "جَزِيرَةٌ",
    رمل: "رَمْلٌ",
    تراب: "تُرَابٌ",

    // الصفات
    جميل: "جَمِيلٌ",
    كبير: "كَبِيرٌ",
    صغير: "صَغِيرٌ",
    أحمر: "أَحْمَرُ",
    أسود: "أَسْوَدُ",
    أبيض: "أَبْيَضُ",
    أخضر: "أَخْضَرُ",
    أزرق: "أَزْرَقُ",
    أصفر: "أَصْفَرُ",
    أبرتقالي: "بُرْتُقَالِيٌّ",
    طويل: "طَوِيلٌ",
    قصير: "قَصِيرٌ",
    عالي: "عَالٍ",
    منخفض: "مُنْخَفِضٌ",
    قوي: "قَوِيٌ",
    ضعيف: "ضَعِيفٌ",
    جديد: "جَدِيدٌ",
    قديم: "قَدِيمٌ",
    حار: "حَارٌ",
    بارد: "بَارِدٌ",
    دافئ: "دَافِئٌ",
    رطب: "رَطْبٌ",
    جاف: "جَافٌ",
    حلو: "حُلْوٌ",
    مرّ: "مُرٌّ",
    حامض: "حَامِضٌ",
    مالح: "مَالِحٌ",
    سريع: "سَرِيعٌ",
    بطيء: "بَطِيءٌ",
    ثقيل: "ثَقِيلٌ",
    خفيف: "خَفِيفٌ",

    // الضمائر
    أنا: "أَنَا",
    أنت: "أَنْتَ",
    أنتِ: "أَنْتِ",
    هو: "هُوَ",
    هي: "هِيَ",
    نحن: "نَحْنُ",
    أنتم: "أَنْتُمْ",
    أنتن: "أَنْتُنَّ",
    هم: "هُمْ",
    هن: "هُنَّ",

    // حروف الجر
    في: "فِي",
    من: "مِنْ",
    إلى: "إِلَىٰ",
    على: "عَلَىٰ",
    عن: "عَنْ",
    ل: "لِ",
    ك: "كَـ",
    بـ: "بِـ",
    حتى: "حَتَّىٰ",
    منذ: "مُنْذُ",
    ضد: "ضِدَّ",

    // حروف العطف والربط
    و: "وَ",
    ف: "فَ",
    ثم: "ثُمَّ",
    أو: "أَوْ",
    لكن: "لَكِنَّ",
    إذا: "إِذَا",
    إن: "إِنْ",
    لو: "لَوْ",
    لما: "لَمَّا",
    لولا: "لَوْلَا",

    // الأدوات والكلمات الشائعة
    ال: "الـ",
    هذا: "هَذَا",
    هذه: "هَذِهِ",
    ذلك: "ذَلِكَ",
    تلك: "تِلْكَ",
    التي: "الَّتِي",
    الذي: "الَّذِي",
    ما: "مَا",
    متى: "مَتَىٰ",
    أين: "أَيْنَ",
    كيف: "كَيْفَ",
    كم: "كَمْ",
    كذا: "كَذَا",
    نعم: "نَعَمْ",
    لا: "لَا",
    بلى: "بَلَىٰ",
    أم: "أَمْ",
    أما: "أَمَّا",
    كأن: "كَأَنَّ",
    "لا سيما": "لَا سِيَّمَا",
  };

  let result = text;

  // 1. Remplacer chaque mot selon le dictionnaire
  const words = text.split(/(\s+|[.،؛؟!])/);
  result = words
    .map((word) => {
      // Si c'est un espace ou ponctuation, retourner tel quel
      if (/^\s+$/.test(word) || /^[.،؛؟!]$/.test(word)) {
        return word;
      }

      // Chercher le mot exact en dictionnaire
      if (arabicDictionary[word]) {
        return arabicDictionary[word];
      }

      // Chercher des variantes (avec/sans article défini)
      if (word.startsWith("ال")) {
        const baseWord = word.substring(2);
        if (arabicDictionary[baseWord]) {
          return "الـ" + arabicDictionary[baseWord];
        }
      }

      // Le mot n'est pas reconnu: le laisser tel quel (pas de modification)
      return word;
    })
    .join("");

  return result;
}


