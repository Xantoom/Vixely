import { X, FileText } from "lucide-react";
import { formatFileSize } from "@/utils/format.ts";

interface MetadataField {
	label: string;
	value: string | number | null;
}

interface FileMetadataModalProps {
	file: File;
	fields: MetadataField[];
	onClose: () => void;
}

export function FileMetadataModal({ file, fields, onClose }: FileMetadataModalProps) {
	const lastModified = new Date(file.lastModified).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});

	const allFields: MetadataField[] = [
		{ label: "File name", value: file.name },
		{ label: "File size", value: formatFileSize(file.size) },
		{ label: "Type", value: file.type || "Unknown" },
		{ label: "Last modified", value: lastModified },
		...fields,
	];

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
			<div className="relative w-full max-w-[calc(100vw-2rem)] sm:max-w-xs mx-4 rounded-2xl border border-border bg-surface p-5 sm:p-6 animate-scale-in shadow-2xl">
				{/* Close */}
				<button
					onClick={onClose}
					className="absolute top-4 right-4 h-7 w-7 flex items-center justify-center rounded-md text-text-tertiary hover:text-text hover:bg-surface-raised/60 transition-colors cursor-pointer"
				>
					<X size={16} />
				</button>

				{/* Header */}
				<div className="flex items-center gap-3 mb-5">
					<div className="h-10 w-10 rounded-xl gradient-accent flex items-center justify-center">
						<FileText size={20} className="text-white" />
					</div>
					<h2 className="text-sm font-bold">File Info</h2>
				</div>

				{/* Metadata rows */}
				<div className="flex flex-col gap-2">
					{allFields.map(
						(field) =>
							field.value != null && (
								<div key={field.label} className="flex items-start justify-between gap-3">
									<span className="text-[11px] text-text-tertiary shrink-0">{field.label}</span>
									<span className="text-[11px] text-text-secondary font-mono text-right break-all">
										{String(field.value)}
									</span>
								</div>
							),
					)}
				</div>
			</div>
		</div>
	);
}
