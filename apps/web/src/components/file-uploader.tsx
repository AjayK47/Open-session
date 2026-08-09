import { useRef, useState } from "react";
import { UploadCloud, FileText } from "lucide-react";
import { cn } from "@opensession/ui";
import { toast } from "sonner";
import { uploadFile, uploadMyFile } from "../api";

/** Drag/drop or click-to-upload (product plan §1.5 file uploader primitive). */
export function FileUploader({
  eventId,
  fileType,
  refs,
  onUploaded,
  accept,
  label = "Drag a file here, or click to browse",
  as = "admin",
}: {
  eventId: string;
  fileType: string;
  refs?: { person_id?: string; submission_id?: string; session_id?: string; task_assignment_id?: string };
  onUploaded: (fileId: string, file: File) => void;
  accept?: string;
  label?: string;
  /** "admin" uses the organizer upload-intent endpoint; "me" uses /me/files/upload-intent
   * (what a speaker is actually authorized to call for their own files). */
  as?: "admin" | "me";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const fileId = as === "me" ? await uploadMyFile(eventId, file, fileType, refs) : await uploadFile(eventId, file, fileType, refs);
      onUploaded(fileId, file);
      toast.success(`Uploaded ${file.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        void handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
        isDragging ? "border-primary bg-accent" : "border-border hover:border-primary/50",
      )}
    >
      {isUploading ? <FileText className="h-6 w-6 animate-pulse text-muted-foreground" /> : <UploadCloud className="h-6 w-6 text-muted-foreground" />}
      <p className="text-sm text-muted-foreground">{isUploading ? "Uploading..." : label}</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
    </div>
  );
}
