import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const upload = vi.fn();
  const remove = vi.fn();
  const getPublicUrl = vi.fn();
  const storageFrom = vi.fn(() => ({ upload, remove, getPublicUrl }));
  const insertSingle = vi.fn();
  const insertSelect = vi.fn(() => ({ single: insertSingle }));
  const insert = vi.fn(() => ({ select: insertSelect }));
  const updateEq = vi.fn();
  const update = vi.fn(() => ({ eq: updateEq }));
  const listIn = vi.fn();
  const listEq = vi.fn(() => ({ in: listIn }));
  const select = vi.fn(() => ({ eq: listEq }));
  const from = vi.fn(() => ({ insert, update, select }));
  const rpc = vi.fn();
  const getUser = vi.fn();
  const getAdminAccessState = vi.fn();
  return {
    upload,
    remove,
    getPublicUrl,
    storageFrom,
    insertSingle,
    insertSelect,
    insert,
    updateEq,
    update,
    listIn,
    listEq,
    select,
    from,
    rpc,
    getUser,
    getAdminAccessState,
  };
});

vi.mock("@/lib/cloud/supabase", () => ({
  supabase: {
    storage: { from: mocks.storageFrom },
    from: mocks.from,
    rpc: mocks.rpc,
    auth: { getUser: mocks.getUser },
  },
}));

vi.mock("@/lib/admin-auth", () => ({
  getAdminAccessState: mocks.getAdminAccessState,
}));

import {
  PERMANENT_IMAGE_BUCKET,
  PERMANENT_IMAGE_MAX_BYTES,
  archivePermanentPlaceImage,
  getPermanentImagePublicUrl,
  loadActivePermanentImageRows,
  setPermanentImageCover,
  uploadPermanentPlaceImage,
} from "@/lib/cloud/place-images";
import type { CloudPermanentImageRow } from "@/lib/cloud/place-image-model";

const now = "2026-09-15T08:00:00.000Z";
const row: CloudPermanentImageRow = {
  id: "11111111-1111-4111-8111-111111111111",
  place_id: "place-a",
  source: "admin_upload",
  source_reference: null,
  source_url: null,
  attribution: null,
  width: null,
  height: null,
  verified: true,
  last_checked: now,
  created_at: now,
  storage_bucket: PERMANENT_IMAGE_BUCKET,
  storage_path: "place-a/11111111-1111-4111-8111-111111111111.webp",
  rights_basis: "Owned by Around My Dorm",
  mime_type: "image/webp",
  byte_size: 4,
  is_cover: false,
  status: "active",
  created_by: "22222222-2222-4222-8222-222222222222",
  updated_at: now,
};

function imageFile(type = "image/webp", size?: number) {
  const file = new File(["test"], "shop.webp", { type });
  if (size != null) Object.defineProperty(file, "size", { value: size });
  return file;
}

function uploadInput(overrides: Record<string, unknown> = {}) {
  return {
    placeId: "place-a",
    file: imageFile(),
    source: "admin_upload" as const,
    rightsBasis: "Owned by Around My Dorm",
    isCover: false,
    ...overrides,
  };
}

describe("permanent image cloud repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminAccessState.mockResolvedValue({ authenticated: true, admin: true, anonymous: false, email: "admin@example.com" });
    mocks.getUser.mockResolvedValue({ data: { user: { id: row.created_by } }, error: null });
    mocks.upload.mockResolvedValue({ data: { path: row.storage_path }, error: null });
    mocks.insertSingle.mockResolvedValue({ data: row, error: null });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    mocks.updateEq.mockResolvedValue({ data: null, error: null });
    mocks.remove.mockResolvedValue({ data: [], error: null });
    mocks.listIn.mockResolvedValue({ data: [row], error: null });
    mocks.getPublicUrl.mockReturnValue({ data: { publicUrl: "https://cloud.test/place-a/a.webp" } });
  });

  it("rejects unsupported MIME and oversized files before Storage upload", async () => {
    await expect(uploadPermanentPlaceImage(uploadInput({ file: imageFile("image/gif") }) as any)).rejects.toThrow(/image/i);
    await expect(uploadPermanentPlaceImage(uploadInput({ file: imageFile("image/webp", PERMANENT_IMAGE_MAX_BYTES + 1) }) as any)).rejects.toThrow(/8|size|large/i);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("does not insert a registry row when Storage upload fails", async () => {
    mocks.upload.mockResolvedValueOnce({ data: null, error: new Error("storage down") });
    await expect(uploadPermanentPlaceImage(uploadInput() as any)).rejects.toThrow("storage down");
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("removes the uploaded object when registry insertion fails", async () => {
    mocks.insertSingle.mockResolvedValueOnce({ data: null, error: new Error("insert failed") });
    await expect(uploadPermanentPlaceImage(uploadInput() as any)).rejects.toThrow("insert failed");
    expect(mocks.remove).toHaveBeenCalledTimes(1);
  });

  it("sets cover through the atomic RPC after a successful insert", async () => {
    await uploadPermanentPlaceImage(uploadInput({ isCover: true }) as any);
    expect(mocks.rpc).toHaveBeenCalledWith("amd_set_place_image_cover", { p_image_id: row.id });
  });

  it("compensates a failed cover RPC by archiving the row before removing its object", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error("cover failed") });
    await expect(uploadPermanentPlaceImage(uploadInput({ isCover: true }) as any)).rejects.toThrow("cover failed");
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: "archived", is_cover: false }));
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.remove.mock.invocationCallOrder[0]);
  });

  it("archives before object removal and leaves the row archived if removal fails", async () => {
    mocks.remove.mockResolvedValueOnce({ data: null, error: new Error("remove failed") });
    await expect(archivePermanentPlaceImage(row)).resolves.toEqual({ objectRemoved: false });
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: "archived", is_cover: false }));
    expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.remove.mock.invocationCallOrder[0]);
  });

  it("loads only active rows in bounded place-id chunks and materializes public URLs", async () => {
    const rows = await loadActivePermanentImageRows(["place-a"]);
    expect(rows).toEqual([row]);
    expect(mocks.select).toHaveBeenCalled();
    expect(mocks.listEq).toHaveBeenCalledWith("status", "active");
    expect(mocks.listIn).toHaveBeenCalledWith("place_id", ["place-a"]);
    expect(getPermanentImagePublicUrl(row)).toBe("https://cloud.test/place-a/a.webp");
    expect(mocks.storageFrom).toHaveBeenCalledWith(PERMANENT_IMAGE_BUCKET);
  });

  it("uses the cover RPC directly and avoids a request for an empty place list", async () => {
    await setPermanentImageCover(row.id);
    expect(mocks.rpc).toHaveBeenCalledWith("amd_set_place_image_cover", { p_image_id: row.id });
    vi.clearAllMocks();
    await expect(loadActivePermanentImageRows([])).resolves.toEqual([]);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
