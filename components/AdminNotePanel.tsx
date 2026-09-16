"use client";

import { useEffect, useState } from "react";
import { ADMIN_NOTE_MAX_LENGTH } from "@/lib/admin-notes";

export function AdminNotePanel({
  note,
  adminAllowed,
  language,
  publicTitle,
  editLabel,
  onSave,
}: {
  note: string | null;
  adminAllowed: boolean;
  language: "th" | "en";
  publicTitle: string;
  editLabel: string;
  onSave: (note: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setDraft(note || "");
  }, [note, editing]);

  if (!note && !adminAllowed) return null;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Admin note could not be saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-4 rounded-[24px] border border-cyan-300/15 bg-cyan-300/[0.055] p-4" aria-label={publicTitle}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-200/75">{publicTitle}</p>
          <p className="mt-1 text-[9px] text-white/35">{language === "en" ? "Shared by the Around My Dorm admin" : "ข้อมูลร่วมจากผู้ดูแล Around My Dorm"}</p>
        </div>
        {adminAllowed && !editing && (
          <button type="button" onClick={() => { setDraft(note || ""); setError(null); setEditing(true); }} className="min-h-10 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.08] px-3 text-[9px] font-bold text-cyan-100">
            {editLabel}
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-3">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={ADMIN_NOTE_MAX_LENGTH}
            rows={4}
            disabled={saving}
            placeholder={language === "en" ? "Example: generous portions / parking is difficult / good value" : "ตัวอย่าง: ข้าวเยอะ / จอดยาก / คุ้ม"}
            className="w-full resize-none rounded-2xl border border-white/10 bg-black/20 p-3 text-[11px] leading-5 text-white/85 outline-none focus:border-cyan-300/30"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-[9px] text-white/35">{draft.length}/{ADMIN_NOTE_MAX_LENGTH}</span>
            <div className="flex gap-2">
              <button type="button" disabled={saving} onClick={() => { setEditing(false); setError(null); setDraft(note || ""); }} className="min-h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[9px] font-bold text-white/60">
                {language === "en" ? "Cancel" : "ยกเลิก"}
              </button>
              <button type="button" disabled={saving} onClick={() => void save()} className="min-h-10 rounded-xl bg-cyan-300 px-4 text-[9px] font-bold text-[#031018] disabled:opacity-50">
                {saving ? (language === "en" ? "Saving…" : "กำลังบันทึก…") : (language === "en" ? "Save" : "บันทึก")}
              </button>
            </div>
          </div>
          <p className="mt-2 text-[9px] text-white/35">{language === "en" ? "Save an empty note to remove it." : "บันทึกข้อความว่างเพื่อลบโน้ตนี้"}</p>
          {error && <p role="alert" className="mt-2 text-[9px] leading-4 text-rose-200">{error}</p>}
        </div>
      ) : note ? (
        <p className="mt-3 whitespace-pre-wrap text-[11px] leading-6 text-white/72">{note}</p>
      ) : (
        <p className="mt-3 text-[10px] text-white/40">{language === "en" ? "No admin note yet." : "ยังไม่มีโน้ตจากผู้ดูแล"}</p>
      )}
    </section>
  );
}
