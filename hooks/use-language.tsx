import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { translations, Language, LANGUAGE_NAMES } from "@/constants/translations";
import AsyncStorage from "@react-native-async-storage/async-storage";

type LanguageContextType = {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (path: string, variables?: Record<string, string | number>) => string;
  availableLanguages: Language[];
  getLanguageName: (lang: Language) => string;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const AVAILABLE_LANGUAGES: Language[] = ["fr", "en", "de", "es", "ru", "ms", "ar"];

export function LanguageProvider(props: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("fr");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const saved = await AsyncStorage.getItem("app_language");
        if (saved && AVAILABLE_LANGUAGES.includes(saved as Language)) {
          setLanguageState(saved as Language);
        }
      } catch (err) {
        __DEV__ && console.error("Error loading language:", err);
      } finally {
        setIsReady(true);
      }
    };

    loadLanguage();
  }, []);

  const setLanguage = async (lang: Language) => {
    try {
      await AsyncStorage.setItem("app_language", lang);
      setLanguageState(lang);
    } catch (err) {
      __DEV__ && console.error("Error saving language:", err);
    }
  };

  const getLanguageName = (lang: Language): string => {
    return LANGUAGE_NAMES[lang] || lang;
  };

  const t = (path: string, variables?: Record<string, string | number>): string => {
    const keys = path.split(".");
    let value: any = translations[language];

    for (const key of keys) {
      if (value && typeof value === "object" && key in value) {
        value = value[key];
      } else {
        return path;
      }
    }

    if (typeof value !== "string") {
      return path;
    }

    // Remplacer les variables {{variable}} par leurs valeurs
    if (variables) {
      return value.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
        return variables[varName] !== undefined ? String(variables[varName]) : match;
      });
    }

    return value;
  };

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        t,
        availableLanguages: AVAILABLE_LANGUAGES,
        getLanguageName,
      }}
    >
      {props.children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}
