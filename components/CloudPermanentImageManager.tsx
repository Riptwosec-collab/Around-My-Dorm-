"use client";

import { useEffect, useMemo, useState } from "react";
import {
  archivePermanentPlaceImage,
  getPermanentImagePublicUrl,
  loadActivePermanentImageRows,
  setPermanentImageCover,
  uploadPermanentPlaceImage,
} from "@/lib/cloud/place-images";
import type { CloudPermanentImageRow, PermanentImageSource } from "@/lib/cloud/place-image-model";
import { getGoogleRuntimePhoto } from "@/lib/google-photo-runtime";
import type { Place } from "@/types/place";

function hasPersistedImage(place: Place) {
  return Boolean(
    place.coverImage
    || place.image
    || place.images?.some(Boolean)
    || place.galleryImages?.some(Boolean)
    || place.imageMetadata?.some((image) => Boolean(image.url) && image.source !== "google_places"),
  );
}

function readableError(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Unknown error");
}

export function CloudPermanentImageManager({
  places,
  onChanged,
}: {
  places: Place[];
  onChanged: () => void | Promise<void>;
}) {
  const [selectedPlaceId, setSelectedPlaceId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<PermanentImageSource>("admin_upload");
  const [rightsBasis, setRightsBasis] = useState("");
  const [attribution, setAttribution] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [isCover, setIsCover] = useState(true);
  const [rows, setRows] = useState<CloudPermanentImageRow[]>([]);
  const [running, setRunning] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedPlaceId && places[0]?.id) setSelectedPlaceId(places[0].id);
    if (selectedPlaceId && !places.some((place) => place.id === selectedPlaceId)) {
      setSelectedPlaceId(places[0]?.id || "");
    }
  }, [places, selectedPlaceId]);

  async function refreshRows() {
    if (!places.length) {
      setRows([]);
      return;
    }
    setLoadingRows(true);
    try {
      setRows(await loadActivePermanentImageRows(places.map((place) => place.id)));
    } catch (error) {
      setMessage(`อ่าน Cloud images ไม่สำเร็จ: ${readableError(error)}`);
    } finally {
      setLoadingRows(false);
    }
  }

  useEffect(() => {
    void refreshRows();
  }, [places]);

  const selectedRows = useMemo(
    () => rows.filter((row) => row.place_id === selectedPlaceId),
    [rows, selectedPlaceId],
  );

  const summary = useMemo(() => {
    const cloudCoverPlaceIds = new Set(rows.filter((row) => row.is_cover).map((row) => row.place_id));
    let runtimeOnly = 0;
    let noPersisted = 0;
    for (const place of places) {
      const persisted = hasPersistedImage(place);
      if (!persisted) noPersisted += 1;
      if (!persisted && getGoogleRuntimePhoto(place.id)) runtimeOnly += 1;
    }
    return {
      permanent: rows.length,
      cloudCovers: cloudCoverPlaceIds.size,
      runtimeOnly,
      noPersisted,
    };
  }, [places, rows]);

  async function syncAfterChange(success: string) {
    await refreshRows();
    await onChanged();
    setMessage(success);
  }

  async function upload() {
    if (running || !selectedPlaceId || !file || !rightsBasis.trim()) return;
    setRunning(true);
    setMessage(null);
    try {
      await uploadPermanentPlaceImage({
        placeId: selectedPlaceId,
        file,
        source,
        rightsBasis,
        attribution: attribution.trim() || null,
        sourceUrl: sourceUrl.trim() || null,
        isCover,
      });
      setFile(null);
      setRightsBasis("");
      setAttribution("");
      setSourceUrl("");
      await syncAfterChange("บันทึกรูปถาวรขึ้น Cloud สำเร็จ");
    } catch (error) {
      setMessage(`บันทึกรูปไม่สำเร็จ: ${readableError(error)}`);
    } finally {
      setRunning(false);
    }
  }

  async function makeCover(row: CloudPermanentImageRow) {
    if (running || row.is_cover) return;
    setRunning(true);
    setMessage(null);
    try {
      await setPermanentImageCover(row.id);
      await syncAfterChange("ตั้งรูปปก Cloud สำเร็จ");
    } catch (error) {
      setMessage(`ตั้งรูปปกไม่สำเร็จ: ${readableError(error)}`);
    } finally {
      setRunning(false);
    }
  }

  async function archive(row: CloudPermanentImageRow) {
    if (running) return;
    setRunning(true);
    setMessage(null);
    try {
      const result = await archivePermanentPlaceImage(row);
      await syncAfterChange(result.objectRemoved ? "Archive รูปและลบไฟล์สำเร็จ" : "Archive metadata สำเร็จ แต่ลบไฟล์ Storage ไม่สำเร็จ");
    } catch (error) {
      setMessage(`Archive รูปไม่สำเร็จ: ${readableError(error)}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <section data-testid="cloud-permanent-image-manager" className="mt-4 rounded-[20px] border border-emerald-300/15 bg-emerald-300/[0.035] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black tracking-[0.16em] text-emerald-100">CLOUD PERMANENT IMAGES</p>
          <p className="mt-1 text-[8px] leading-4 text-white/45">เก็บเฉพาะรูปที่มีสิทธิ์ใช้งานชัดเจนใน Supabase Storage • Google runtime photos เป็นภาพชั่วคราวและคัดลอกเข้า Cloud ไม่ได้</p>
        </div>
        {loadingRows && <span className="text-[8px] text-emerald-200/60">Sync…</span>}
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1 text-center text-[7px]">
        <div className="rounded-xl bg-black/15 p-2"><p className="text-white/40">Cloud</p><strong>{summary.permanent}</strong></div>
        <div className="rounded-xl bg-black/15 p-2"><p className="text-white/40">Cover</p><strong>{summary.cloudCovers}</strong></div>
        <div className="rounded-xl bg-black/15 p-2"><p className="text-white/40">Google runtime</p><strong>{summary.runtimeOnly}</strong></div>
        <div className="rounded-xl bg-black/15 p-2"><p className="text-white/40">No persisted</p><strong>{summary.noPersisted}</strong></div>
      </div>

      <div className="mt-3 grid gap-2">
        <select
          value={selectedPlaceId}
          onChange={(event) => setSelectedPlaceId(event.target.value)}
          className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-[9px] text-white outline-none"
        >
          <option value="">เลือกร้าน</option>
          {places.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}
        </select>

        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          onChange={(event) => setFile(event.target.files?.[0] || null)}
          className="block w-full rounded-xl border border-white/10 bg-black/20 p-2 text-[8px] text-white/70 file:mr-2 file:rounded-lg file:border-0 file:bg-emerald-300/15 file:px-2 file:py-1.5 file:text-[8px] file:text-emerald-100"
        />

        <div className="grid grid-cols-2 gap-2">
          <select
            value={source}
            onChange={(event) => setSource(event.target.value as PermanentImageSource)}
            className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-[8px] text-white outline-none"
          >
            <option value="admin_upload">admin_upload</option>
            <option value="licensed_import">licensed_import</option>
          </select>
          <label className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 text-[8px] text-white/65">
            <input type="checkbox" checked={isCover} onChange={(event) => setIsCover(event.target.checked)} /> Set as cover
          </label>
        </div>

        <input
          value={rightsBasis}
          onChange={(event) => setRightsBasis(event.target.value)}
          placeholder="Rights basis * เช่น Owned / Licensed by ..."
          className="h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-[8px] text-white outline-none placeholder:text-white/25"
        />
        <input
          value={attribution}
          onChange={(event) => setAttribution(event.target.value)}
          placeholder="Attribution (optional)"
          className="h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-[8px] text-white outline-none placeholder:text-white/25"
        />
        <input
          value={sourceUrl}
          onChange={(event) => setSourceUrl(event.target.value)}
          placeholder="Source URL (optional)"
          className="h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-[8px] text-white outline-none placeholder:text-white/25"
        />

        <button
          type="button"
          disabled={running || !selectedPlaceId || !file || !rightsBasis.trim()}
          onClick={() => void upload()}
          className="amd-btn amd-btn-primary min-h-10 rounded-xl text-[8px] font-bold disabled:cursor-not-allowed disabled:opacity-35"
        >
          {running ? "กำลังบันทึก…" : "Upload permanent image"}
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {selectedRows.map((row) => (
          <article key={row.id} className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-black/15 p-2">
            <img src={getPermanentImagePublicUrl(row)} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[8px] font-semibold text-white/80">{row.source} {row.is_cover ? "• COVER" : ""}</p>
              <p className="truncate text-[7px] text-white/35">{row.rights_basis}</p>
            </div>
            {!row.is_cover && <button type="button" disabled={running} onClick={() => void makeCover(row)} className="rounded-lg bg-cyan-300/10 px-2 py-1.5 text-[7px] text-cyan-100 disabled:opacity-40">Set cover</button>}
            <button type="button" disabled={running} onClick={() => void archive(row)} className="rounded-lg bg-rose-300/10 px-2 py-1.5 text-[7px] text-rose-100 disabled:opacity-40">Archive</button>
          </article>
        ))}
        {!loadingRows && selectedPlaceId && selectedRows.length === 0 && <p className="text-[8px] text-white/35">ร้านนี้ยังไม่มี permanent Cloud image</p>}
      </div>

      {message && <p className="mt-3 rounded-xl border border-white/[0.06] bg-black/15 px-3 py-2 text-[8px] leading-4 text-white/60">{message}</p>}
    </section>
  );
}
