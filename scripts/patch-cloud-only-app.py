from pathlib import Path

path = Path("components/AroundMyDormApp.tsx")
text = path.read_text()

text = text.replace('const [databasePlaces, setDatabasePlaces] = useState<Place[]>(PLACES);', 'const [databasePlaces, setDatabasePlaces] = useState<Place[]>([]);', 1)
text = text.replace('const [databaseSource, setDatabaseSource] = useState("embedded");', 'const [databaseSource, setDatabaseSource] = useState("supabase");', 1)

old = '''  async function reloadDatabase() {
    setLoadingPlaces(true);
    try {
      const result = await loadPlacesFromDatabase();
      setDatabasePlaces(result.places);
      setDatabaseSource(result.source);
      if (result.warning) showToast(result.warning, "removed");
    } finally {
      setLoadingPlaces(false);
    }
  }'''
new = '''  async function reloadDatabase() {
    setLoadingPlaces(true);
    try {
      const result = await loadPlacesFromDatabase();
      setDatabasePlaces(result.places);
      setDatabaseSource(result.source);
      setCloudError(null);
      if (result.warning) showToast(result.warning, "removed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Supabase cloud database unavailable";
      setDatabasePlaces([]);
      setDatabaseSource("supabase");
      setCloudError(message);
      showToast(settings.language === "en" ? `Cloud database unavailable: ${message}` : `ฐานข้อมูล Cloud ใช้งานไม่ได้: ${message}`, "removed");
    } finally {
      setLoadingPlaces(false);
    }
  }'''
if old not in text:
    raise SystemExit("reloadDatabase block not found")
text = text.replace(old, new, 1)

path.write_text(text)
