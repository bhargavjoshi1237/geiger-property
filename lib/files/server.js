import { FILES_BUCKET, objectPath, uniqueName } from "./refs";

// Server uploads (PLAT-01g): generated files (agreements, exports) go to the private property-files bucket under
// <projectId>/<ownerType>/<ownerId>/ with the service role. Records keep the returned { bucket, path }; screens and portal responses sign it.
export async function storeProjectFile(admin, { projectId, ownerType, ownerId, name, body, contentType = "application/octet-stream" }) {
  const path = objectPath(projectId, ownerType, ownerId, uniqueName(name, contentType));
  const { error } = await admin.storage.from(FILES_BUCKET).upload(path, body, { contentType, cacheControl: "3600", upsert: false });
  if (error) throw new Error(`storage: ${error.message}`);
  return { bucket: FILES_BUCKET, path };
}
