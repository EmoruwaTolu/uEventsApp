import { API_BASE } from "./api";
import * as ImageManipulator from "expo-image-manipulator";

const MAX_PX = 1200;

/**
 * Resizes a local image to at most 1200px on its longest side (preserving
 * aspect ratio), compresses to JPEG quality 0.85, then uploads to the backend.
 * If the URI is already a remote URL it is returned as-is.
 */
export async function uploadImage(localUri: string, token?: string): Promise<string> {
    if (localUri.startsWith("http")) return localUri;

    // Resize + compress
    const result = await ImageManipulator.manipulateAsync(
        localUri,
        [{ resize: { width: MAX_PX } }],   // expo-image-manipulator preserves aspect ratio when only width is given
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
    );

    const uri = result.uri;
    const filename = uri.split("/").pop() ?? "image.jpg";

    const formData = new FormData();
    formData.append("file", { uri, name: filename, type: "image/jpeg" } as any);

    const res = await fetch(`${API_BASE}/uploads`, {
        method: "POST",
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `Image upload failed (${res.status})`);
    }

    const data = await res.json();
    return data.url as string;
}
