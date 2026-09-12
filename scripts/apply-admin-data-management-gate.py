from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"{label}: patch target not found")
    return text.replace(old, new, 1)


# 1) Data Management owns the single admin login boundary.
path = Path("components/DataManagement.tsx")
text = path.read_text()
text = replace_once(
    text,
    'import { AdminPlatformDiagnostics } from "@/components/AdminPlatformDiagnostics";\n',
    'import { AdminPlatformDiagnostics } from "@/components/AdminPlatformDiagnostics";\nimport { AdminGoogleAccess } from "@/components/AdminGoogleAccess";\nimport type { AdminAccessState } from "@/lib/admin-auth";\n',
    "data management admin imports",
)
text = replace_once(
    text,
    'const EMPTY_HOURS = { monday: null, tuesday: null, wednesday: null, thursday: null, friday: null, saturday: null, sunday: null };\n',
    'const EMPTY_HOURS = { monday: null, tuesday: null, wednesday: null, thursday: null, friday: null, saturday: null, sunday: null };\nconst EMPTY_ADMIN_ACCESS: AdminAccessState = { authenticated: false, admin: false, anonymous: false, email: null };\n',
    "empty admin state",
)
text = replace_once(
    text,
    'export function DataManagement({ places, databaseSource, language, onClose, onReload }: { places: Place[]; databaseSource: string; language: "th" | "en"; onClose: () => void; onReload: () => void }) {\n  const [mode, setMode] = useState<UpdateMode>("older30");',
    'export function DataManagement({ places, databaseSource, language, onClose, onReload }: { places: Place[]; databaseSource: string; language: "th" | "en"; onClose: () => void; onReload: () => void }) {\n  const [adminAccess, setAdminAccess] = useState<AdminAccessState>(EMPTY_ADMIN_ACCESS);\n  const [mode, setMode] = useState<UpdateMode>("older30");',
    "admin state",
)
text = replace_once(
    text,
    '''  const [pending, setPending] = useState<Awaited<ReturnType<typeof loadPendingPlaceChanges>>>([]);\n  const [history, setHistory] = useState<LocalPlaceHistory[]>([]);\n  useEffect(() => {\n    void Promise.all([loadPendingPlaceChanges(), loadLocalPlaceHistory()]).then(([nextPending, nextHistory]) => { setPending(nextPending); setHistory(nextHistory); }).catch((error) => setMessage(error instanceof Error ? error.message : "Cloud state unavailable"));\n  }, []);''',
    '''  const [pending, setPending] = useState<Awaited<ReturnType<typeof loadPendingPlaceChanges>>>([]);\n  const [history, setHistory] = useState<LocalPlaceHistory[]>([]);\n  useEffect(() => {\n    if (!adminAccess.admin) {\n      setPending([]);\n      setHistory([]);\n      return;\n    }\n    void Promise.all([loadPendingPlaceChanges(), loadLocalPlaceHistory()]).then(([nextPending, nextHistory]) => { setPending(nextPending); setHistory(nextHistory); }).catch((error) => setMessage(error instanceof Error ? error.message : "Cloud state unavailable"));\n  }, [adminAccess.admin]);''',
    "gate cloud maintenance reads",
)
text = replace_once(
    text,
    '''        </div>\n\n        <DataQualityDashboard places={places} language={language} />''',
    '''        </div>\n\n        <AdminGoogleAccess language={language} onStateChange={setAdminAccess} />\n\n        {!adminAccess.admin ? (\n          <section data-testid="data-management-admin-locked" className="amd-glass amd-card mt-4 border border-amber-300/15 p-5 text-center">\n            <ShieldCheck className="mx-auto h-7 w-7 text-amber-200" />\n            <p className="mt-3 text-[13px] font-bold">{language === "en" ? "Admin login required" : "ต้องเข้าสู่ระบบ Admin"}</p>\n            <p className="mt-2 text-[9px] leading-5 text-white/50">{language === "en" ? "Sign in above with the authorized Supabase admin account to connect maintenance tools to the database. Place browsing remains read-only." : "เข้าสู่ระบบด้วยบัญชี Supabase Admin ที่ได้รับสิทธิ์ด้านบน เพื่อเชื่อมเครื่องมือ Maintenance กับฐานข้อมูล • ก่อน Login ข้อมูลร้านจะเป็น Read-only"}</p>\n            <div className="mt-3 rounded-xl border border-white/[0.06] bg-black/10 px-3 py-2 text-[9px] text-white/45">Supabase • {places.length} places • {databaseSource}</div>\n          </section>\n        ) : (\n          <>\n            <section data-testid="data-management-admin-ready" className="mt-4 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.04] p-3 text-[9px] text-emerald-100">\n              <strong>{language === "en" ? "Supabase admin connected" : "เชื่อม Supabase Admin แล้ว"}</strong> • {places.length} {language === "en" ? "places" : "ร้าน"} • {databaseSource}\n            </section>\n\n        <DataQualityDashboard places={places} language={language} />''',
    "render admin login gate",
)
text = text.replace(
    '<GoogleCloudAutoEnrichment places={places} language={language} onReload={onReload} />',
    '<GoogleCloudAutoEnrichment places={places} language={language} onReload={onReload} adminAccess={adminAccess} />',
    1,
)
text = text.replace(
    '<GoogleRouteRefresh places={places} language={language} onReload={onReload} />',
    '<GoogleRouteRefresh places={places} language={language} onReload={onReload} adminAllowed={adminAccess.admin} />',
    1,
)
tail = '\n      </section>\n    </div>\n  );\n}'
idx = text.rfind(tail)
if idx < 0:
    raise SystemExit("data management closing gate target not found")
text = text[:idx] + '\n          </>\n        )}' + text[idx:]
path.write_text(text)


# 2) Bulk Google panel consumes the verified Data Management admin state.
path = Path("components/GoogleCloudAutoEnrichment.tsx")
text = path.read_text()
text = text.replace('import { AdminGoogleAccess } from "@/components/AdminGoogleAccess";\n', '', 1)
text = replace_once(
    text,
    '''const EMPTY_ADMIN: AdminAccessState = {\n  authenticated: false,\n  admin: false,\n  anonymous: false,\n  email: null,\n};\n\n''',
    '',
    "remove nested empty admin",
)
text = replace_once(
    text,
    '''export function GoogleCloudAutoEnrichment({\n  places,\n  language,\n  onReload,\n}: {\n  places: Place[];\n  language: "th" | "en";\n  onReload: () => void;\n}) {\n  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";\n  const [admin, setAdmin] = useState<AdminAccessState>(EMPTY_ADMIN);''',
    '''export function GoogleCloudAutoEnrichment({\n  places,\n  language,\n  onReload,\n  adminAccess,\n}: {\n  places: Place[];\n  language: "th" | "en";\n  onReload: () => void;\n  adminAccess: AdminAccessState;\n}) {\n  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";\n  const admin = adminAccess;''',
    "bulk admin prop",
)
text = text.replace('      <AdminGoogleAccess language={language} onStateChange={setAdmin} />\n\n', '', 1)
path.write_text(text)


# 3) Admin login reacts immediately to Supabase auth callbacks and labels the DB connection clearly.
path = Path("components/AdminGoogleAccess.tsx")
text = path.read_text()
text = replace_once(
    text,
    'import { HomeOriginManager } from "@/components/HomeOriginManager";\n',
    'import { HomeOriginManager } from "@/components/HomeOriginManager";\nimport { supabase } from "@/lib/cloud/supabase";\n',
    "admin supabase import",
)
old_effect = '''  useEffect(() => {\n    let alive = true;\n    void getAdminAccessState()\n      .then((next) => {\n        if (!alive) return;\n        setState(next);\n        onStateChange?.(next);\n      })\n      .catch((error) => {\n        if (alive) setMessage(error instanceof Error ? error.message : "Admin access unavailable");\n      });\n    return () => { alive = false; };\n  }, [onStateChange]);'''
new_effect = '''  useEffect(() => {\n    let alive = true;\n    const sync = () => {\n      void getAdminAccessState()\n        .then((next) => {\n          if (!alive) return;\n          setState(next);\n          onStateChange?.(next);\n        })\n        .catch((error) => {\n          if (alive) setMessage(error instanceof Error ? error.message : "Admin access unavailable");\n        });\n    };\n    sync();\n    const { data } = supabase.auth.onAuthStateChange(() => sync());\n    return () => {\n      alive = false;\n      data.subscription.unsubscribe();\n    };\n  }, [onStateChange]);'''
text = replace_once(text, old_effect, new_effect, "admin auth listener")
text = text.replace('GOOGLE MAINTENANCE ADMIN', 'ADMIN DATABASE LOGIN', 1)
text = text.replace(
    'Bulk Google และ Routes ต้องใช้บัญชี Admin จริง • Anonymous session ใช้สิทธิ์นี้ไม่ได้',
    'เข้าสู่ระบบ Admin เพื่อเชื่อม Supabase Database และเปิดเครื่องมือแก้ข้อมูล / Google / Routes • Anonymous session ใช้สิทธิ์นี้ไม่ได้',
    1,
)
text = text.replace(
    '{language === "en" ? "Send sign-in link" : "ส่งลิงก์เข้าสู่ระบบ"}',
    '{language === "en" ? "Login Admin" : "เข้าสู่ระบบ Admin"}',
    1,
)
path.write_text(text)


# 4) Existing cancel test now supplies the centralized admin session explicitly.
path = Path("tests/google-cloud-auto-enrichment-cancel.test.ts")
text = path.read_text()
start = text.find('vi.mock("@/components/AdminGoogleAccess"')
if start >= 0:
    end_marker = '}));\n\nvi.mock("@/lib/google-cloud-enrichment"'
    end = text.find(end_marker, start)
    if end < 0:
        raise SystemExit("cancel test admin mock end not found")
    text = text[:start] + 'vi.mock("@/lib/google-cloud-enrichment"' + text[end + len(end_marker):]
text = text.replace(
    'render(React.createElement(GoogleCloudAutoEnrichment, { places: [place], language: "en", onReload: () => {} }));',
    'render(React.createElement(GoogleCloudAutoEnrichment, { places: [place], language: "en", onReload: () => {}, adminAccess: { authenticated: true, admin: true, anonymous: false, email: "admin@example.com" } }));',
    1,
)
path.write_text(text)
