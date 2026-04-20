import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { persistHevyImport } from "@/lib/hevy/database";
import { HevyImportError, parseHevyCsv } from "@/lib/hevy/import";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const MAX_HEVY_CSV_FILE_SIZE_BYTES = 5 * 1024 * 1024;

function getUploadedFile(formData: FormData) {
  const preferredFile =
    formData.get("file") ?? formData.get("csv") ?? formData.get("upload") ?? null;

  if (preferredFile instanceof File) {
    return preferredFile;
  }

  for (const value of formData.values()) {
    if (value instanceof File) {
      return value;
    }
  }

  return null;
}

function toErrorResponse(error: unknown) {
  if (error instanceof HevyImportError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error("Unexpected Hevy import error", error);
  return NextResponse.json({ error: "Unable to import the uploaded Hevy CSV." }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (!contentType.includes("multipart/form-data")) {
      throw new HevyImportError("Expected a multipart/form-data request.", 415);
    }

    const supabase = createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError) {
      throw new HevyImportError(`Unable to verify the current user: ${authError.message}.`, 401);
    }

    if (!user) {
      throw new HevyImportError("You must be signed in to import a Hevy CSV.", 401);
    }

    const formData = await request.formData();
    const file = getUploadedFile(formData);

    if (!file) {
      throw new HevyImportError("No CSV file was uploaded.");
    }

    if (file.size === 0) {
      throw new HevyImportError("The uploaded CSV file is empty.");
    }

    if (file.size > MAX_HEVY_CSV_FILE_SIZE_BYTES) {
      throw new HevyImportError("The uploaded CSV is too large. Please upload a file smaller than 5 MB.");
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("timezone")
      .eq("id", user.id)
      .maybeSingle();
    const profile = (profileData ?? null) as { timezone: string } | null;

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileHash = createHash("sha256").update(fileBuffer).digest("hex");
    const fileText = fileBuffer.toString("utf8");
    const parsedImport = parseHevyCsv(fileText);
    const result = await persistHevyImport({
      fileHash,
      fileName: file.name || null,
      fileSize: file.size,
      groupedWorkouts: parsedImport.groupedWorkouts,
      parsedRows: parsedImport.parsedRows.length,
      supabase,
      userTimezone: profile?.timezone ?? null,
      userId: user.id
    });

    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
