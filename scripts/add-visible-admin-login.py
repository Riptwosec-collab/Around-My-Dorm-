from pathlib import Path

path = Path("components/AroundMyDormApp.tsx")
text = path.read_text()
old = '''              <section className="amd-glass amd-card mt-4 px-4">
                <SettingRow icon={<Database className="h-5 w-5" />} title={settings.language === "en" ? "Data Management" : "จัดการข้อมูลร้าน"} subtitle={settings.language === "en" ? `Database: ${databaseSource} • ${allPlaces.length} places` : `ฐานข้อมูล: ${databaseSource} • ${allPlaces.length} สถานที่`} action={<button type="button" onClick={() => setDataManagementOpen(true)} className="flex items-center gap-1 text-[11px] font-semibold text-[#149CFF]">{settings.language === "en" ? "Manage" : "จัดการ"} <ChevronRight className="h-4 w-4" /></button>} />
              </section>'''
new = '''              <section className="amd-glass amd-card mt-4 px-4">
                <SettingRow icon={<ShieldCheck className="h-5 w-5 text-amber-200" />} title={settings.language === "en" ? "Admin Login" : "เข้าสู่ระบบ Admin"} subtitle={settings.language === "en" ? "Supabase Database • Google maintenance • Routes" : "เชื่อม Supabase Database • Google maintenance • Routes"} action={<button data-testid="settings-admin-login" type="button" onClick={() => setDataManagementOpen(true)} className="flex items-center gap-1 rounded-xl border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2 text-[10px] font-bold text-amber-100">{settings.language === "en" ? "Login" : "เข้าสู่ระบบ"} <ChevronRight className="h-4 w-4" /></button>} />
                <SettingRow icon={<Database className="h-5 w-5" />} title={settings.language === "en" ? "Data Management" : "จัดการข้อมูลร้าน"} subtitle={settings.language === "en" ? `Database: ${databaseSource} • ${allPlaces.length} places` : `ฐานข้อมูล: ${databaseSource} • ${allPlaces.length} สถานที่`} action={<button type="button" onClick={() => setDataManagementOpen(true)} className="flex items-center gap-1 text-[11px] font-semibold text-[#149CFF]">{settings.language === "en" ? "Manage" : "จัดการ"} <ChevronRight className="h-4 w-4" /></button>} />
              </section>'''
if old not in text:
    raise SystemExit("settings Data Management block not found")
path.write_text(text.replace(old, new, 1))
