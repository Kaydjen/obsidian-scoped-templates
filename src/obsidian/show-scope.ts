import { Modal, Notice } from "obsidian";
import { visibleTemplates } from "../core/scope";
import { errorMessage, getActiveContext, type Host } from "./host";

class ScopeModal extends Modal {
	constructor(
		host: Host,
		private readonly folder: string,
		private readonly visible: ReturnType<typeof visibleTemplates>,
		private readonly invalid: { path: string; error: string }[],
	) {
		super(host.app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", {
			text: this.folder === "" ? "Templates for the whole vault" : `Templates for ${this.folder}`,
		});

		if (this.visible.length === 0) contentEl.createEl("p", { text: "None here" });
		else {
			const list = contentEl.createEl("ul");
			for (const { template, captures } of this.visible) {
				const item = list.createEl("li");
				item.createEl("strong", { text: template.label });
				item.createEl("div", { text: template.path });
				const values = Object.entries(captures).map(([name, value]) => `${name}=${value}`);
				if (values.length > 0) item.createEl("div", { text: `Folder names: ${values.join(", ")}` });
			}
		}
		if (this.invalid.length > 0) {
			contentEl.createEl("h4", { text: "Broken" });
			const list = contentEl.createEl("ul");
			for (const { path, error } of this.invalid) {
				list.createEl("li", { text: `${path.slice(path.lastIndexOf("/") + 1)}: ${error}` });
			}
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export async function runShowScope(host: Host): Promise<void> {
	try {
		const context = getActiveContext(host.app);
		const { valid, invalid } = await host.index.load();
		const visible = visibleTemplates(
			valid.map((entry) => entry.scope),
			context.folder,
			host.settings.folderName,
			host.settings.mru,
		);
		new ScopeModal(host, context.folder, visible, invalid).open();
	} catch (error) {
		new Notice(errorMessage(error));
	}
}
