/** Every user-visible or file-format name lives here, so renaming is a one-file edit. */

export const CONFIG_PREFIX = "tpl-";

export const KEYS = {
	label: `${CONFIG_PREFIX}label`,
	where: `${CONFIG_PREFIX}where`,
	except: `${CONFIG_PREFIX}except`,
	into: `${CONFIG_PREFIX}into`,
	filename: `${CONFIG_PREFIX}filename`,
	open: `${CONFIG_PREFIX}open`,
	command: `${CONFIG_PREFIX}command`,
} as const;

export const KNOWN_KEYS: readonly string[] = Object.values(KEYS);

/** Variable names that cannot be used as capture names in `tpl-where`. */
export const RESERVED_VARS: readonly string[] = [
	"date",
	"time",
	"title",
	"selection",
	"source",
	"cursor",
	"from",
];

export const CURSOR_MARKER = "{{cursor}}";

/** Faint placeholders for empty config keys in the Properties editor. */
export const GHOST_INTO = "(note's folder)";
export const GHOST_WHERE_ROOT = "/";
export const GHOST_CLASS = "scoped-templates-ghost";
/** Set on a view that shows a template file; scopes the template-only styles. */
export const TEMPLATE_VIEW_CLASS = "scoped-templates-view";
/** Set on a property value that holds a `{{variable}}` instead of a literal value. */
export const VARIABLE_CLASS = "scoped-templates-var";
export const PANE_CLASS = "scoped-templates-pane";
/** Set on the first property of each group (template keys, note properties) in a template view. */
export const GROUP_START_CLASS = "scoped-templates-group-start";
export const GROUP_FIRST_CLASS = "scoped-templates-group-first";
export const GROUP_ATTRIBUTE = "data-scoped-group";
export const GROUP_LABELS = { keys: "Template keys", notes: "Note properties" } as const;
/** Set on the document body while a property name is pointed at; hides Obsidian's own tooltip. */
export const KEY_HELP_CLASS = "scoped-templates-key-help";

export const NEW_TEMPLATE_LABEL = "New template";
/** Last row of the template list: a plus marks it as an action, not a template name. */
export const NEW_TEMPLATE_ACTION_LABEL = `+  ${NEW_TEMPLATE_LABEL}`;
/** Set on the list row that starts a new block, so the rows above stay a separate group. */
export const SEPARATED_CLASS = "scoped-templates-separated";
export const NEW_TEMPLATE_CHOOSE_LABEL = "New template…";
/** Most note properties the choice dialog lists. */
export const SKELETON_DIALOG_PROPERTY_LIMIT = 30;
export const EMPTY_BASE_LABEL = "Empty template";
/** In front of an existing template in the list of bases: choosing it makes a copy. */
export const COPY_BASE_PREFIX = "Copy of ";
/** Rows of the list that asks where the new template will be available. */
export const AVAILABLE_IN_PREFIX = "Available in ";
export const AVAILABLE_EVERYWHERE_LABEL = "Available everywhere";
export const NEW_TEMPLATE_BASENAME = "Untitled";
/** Share of notes in a folder that must have a property for the new template to include it. */
export const SKELETON_KEY_THRESHOLD = 0.5;

export const COMMANDS = {
	create: { id: "create", name: "Create from template" },
	apply: { id: "apply", name: "Apply template" },
	showScope: { id: "show-scope", name: "Show templates here" },
	createPrefix: "create-",
	applyPrefix: "apply-",
	createLabel: "Create: ",
	applyLabel: "Apply: ",
} as const;

export interface PluginSettings {
	folderName: string;
	dateFormat: string;
	timeFormat: string;
	inheritFromNeighbors: boolean;
	/** Template keys that the "New template…" dialog had checked last time. */
	templateKeys: string[];
	/** Template path -> last used timestamp. */
	mru: Record<string, number>;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	folderName: "_tpl",
	dateFormat: "YYYY-MM-DD",
	timeFormat: "HH:mm",
	inheritFromNeighbors: true,
	templateKeys: [...KNOWN_KEYS],
	mru: {},
};

export const DEFAULT_NAME_DATE_FORMAT = "YYMMDDHHmm";
export const MAX_NAME_LENGTH = 200;
