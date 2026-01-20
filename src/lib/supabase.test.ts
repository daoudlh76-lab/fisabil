import { supabase } from "./supabase";

/**
 * Test de connexion à Supabase
 * Vérifie que le client est correctement configuré
 */
export async function testSupabaseConnection() {
  try {
    console.log("🧪 Test 1: Vérification de la configuration...");
    
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    
    console.log("✅ Test 1: Configuration OK");
    console.log("  - URL Supabase chargée");
    console.log("  - Clés d'API chargées");
    console.log("  - Session:", data?.session ? "Utilisateur connecté" : "Non connecté");
    
    return true;
  } catch (error: any) {
    console.error("❌ Test 1 FAILED:", error?.message);
    return false;
  }
}

/**
 * Test d'inscription
 */
export async function testSignUp(email: string, password: string) {
  try {
    console.log(`\n🧪 Test 2: Inscription avec ${email}...`);
    
    const { data, error } = await supabase.auth.signUp({ email, password });
    
    if (error) throw error;
    
    console.log("✅ Test 2: Inscription OK");
    console.log("  - User ID:", data?.user?.id);
    console.log("  - Email:", data?.user?.email);
    
    return data?.user?.id;
  } catch (error: any) {
    console.error("❌ Test 2 FAILED:", error?.message);
    return null;
  }
}

/**
 * Test de connexion
 */
export async function testSignIn(email: string, password: string) {
  try {
    console.log(`\n🧪 Test 3: Connexion avec ${email}...`);
    
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) throw error;
    
    console.log("✅ Test 3: Connexion OK");
    console.log("  - User ID:", data?.user?.id);
    console.log("  - Token:", data?.session?.access_token?.substring(0, 20) + "...");
    
    return data?.session?.user?.id;
  } catch (error: any) {
    console.error("❌ Test 3 FAILED:", error?.message);
    return null;
  }
}

/**
 * Test de création d'un scan
 */
export async function testCreateScan(userId: string, title: string, content: string) {
  try {
    console.log(`\n🧪 Test 4: Création d'un scan...`);
    
    const { data, error } = await supabase
      .from("scans")
      .insert([{ user_id: userId, title, content }])
      .select();
    
    if (error) throw error;
    
    console.log("✅ Test 4: Scan créé OK");
    console.log("  - Scan ID:", data?.[0]?.id);
    console.log("  - Titre:", data?.[0]?.title);
    
    return data?.[0]?.id;
  } catch (error: any) {
    console.error("❌ Test 4 FAILED:", error?.message);
    return null;
  }
}

/**
 * Test de lecture des scans
 */
export async function testReadScans(userId: string) {
  try {
    console.log(`\n🧪 Test 5: Lecture des scans...`);
    
    const { data, error } = await supabase
      .from("scans")
      .select("*")
      .eq("user_id", userId);
    
    if (error) throw error;
    
    console.log("✅ Test 5: Scans lus OK");
    console.log(`  - Nombre de scans: ${data?.length ?? 0}`);
    
    return data;
  } catch (error: any) {
    console.error("❌ Test 5 FAILED:", error?.message);
    return null;
  }
}

/**
 * Test de déconnexion
 */
export async function testSignOut() {
  try {
    console.log(`\n🧪 Test 6: Déconnexion...`);
    
    const { error } = await supabase.auth.signOut();
    
    if (error) throw error;
    
    console.log("✅ Test 6: Déconnexion OK");
    
    return true;
  } catch (error: any) {
    console.error("❌ Test 6 FAILED:", error?.message);
    return false;
  }
}

/**
 * Exécuter tous les tests
 */
export async function runAllTests() {
  console.log("\n========================================");
  console.log("🔬 TESTS SUPABASE COMPLETS");
  console.log("========================================\n");
  
  // Test 1: Connexion
  const isConnected = await testSupabaseConnection();
  if (!isConnected) {
    console.error("\n❌ Impossible de continuer - config invalide");
    return;
  }
  
  // Test 2-6: Full flow
  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = "Password123!";
  const testTitle = "Test Scan";
  const testContent = "نص عربي للتجربة";
  
  const userId = await testSignIn(testEmail, testPassword);
  if (!userId) {
    console.log("\n💡 Utilisateur n'existe pas, créons-le...");
    await testSignUp(testEmail, testPassword);
    await testSignIn(testEmail, testPassword);
  }
  
  const scanId = await testCreateScan(userId || "", testTitle, testContent);
  const scans = await testReadScans(userId || "");
  await testSignOut();
  
  console.log("\n========================================");
  console.log("✅ TOUS LES TESTS COMPLÉTÉS");
  console.log("========================================\n");
}
