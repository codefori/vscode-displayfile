export interface DdsLineRange {
    start: number;
    endHeader?: number;
    end: number;
}
export interface DdsUpdate {
    newLines: string[];
    range?: DdsLineRange;
}
export declare const GLOBAL_RECORD_NAME = "_GLOBAL";
export interface LineInsertion {
    text: string;
    useAtLine: boolean;
}
/**
 * Decides how to insert freshly generated DDS lines into a document.
 * `atLine` comes from this module's own line-based math (e.g.
 * `RecordInfo.range.end` when appending after everything else in a record
 * or file) - it's derived from a plain `content.split(/\r?\n/).length`,
 * which doesn't always match a live editor document's own line count.
 * Inserting directly at that line number when it's at or past the
 * document's real end can silently land past the last line and glue the
 * new content onto it instead of starting a fresh one, so callers should
 * fall back to appending at the document's true end (`useAtLine: false`,
 * text already includes a leading newline if the document doesn't already
 * end with one) whenever `atLine` reaches `documentLineCount`.
 */
export declare function planLineInsertion(documentLineCount: number, documentEndsWithNewline: boolean, documentIsEmpty: boolean, atLine: number, lines: string[]): LineInsertion;
export declare class DisplayFile {
    formats: RecordInfo[];
    currentField: FieldInfo | undefined;
    currentFields: FieldInfo[];
    currentRecord: RecordInfo | undefined;
    constructor();
    /**
    * @param {string[]} lines
    */
    parse(lines: string[]): void;
    /**
    * @param {string} keywords
    * @param {string} [conditionals]
    * @returns
    */
    HandleKeywords(keywords: string, conditionals?: string): void;
    /**
     * Computes the printed line for every field flagged `needsPrinterLine`
     * (a printer-file field with no Y coded) by walking them in order with a
     * running "print cursor", the same way a real printer file lays them out:
     * a field with no SPACEB/SKIPB continues on the current line, SPACEB(n)
     * spaces the cursor forward n lines first, SKIPB(n) jumps the cursor
     * straight to line n, and SPACEA(n)/SKIPA(n) do the equivalent *after*
     * printing, so they affect where the next blank-Y field lands. An
     * explicit Y (DSPF-shaped, or a PRTF field that did code a line) resyncs
     * the cursor. `recordKeywords` seeds the cursor from the record's own
     * SPACEB/SKIPB, since that's coded on the format, not any one field.
     *
     * A SPACEB/SKIPB/SPACEA/SKIPA value that isn't a literal number (a
     * reference to a runtime field) can't be resolved here, so it's treated
     * as absent rather than guessed.
     */
    static assignPrinterLines(fields: FieldInfo[], recordKeywords?: Keyword[]): void;
    static parseConditionals(conditionColumns: string): Conditional[];
    /**
     * Column 1 of the conditioning-indicator columns is the AND/OR relator
     * between this line's indicator group and whatever group came before it
     * (blank/'A' continues the current AND-group, 'O' starts a new OR'd
     * group) - real DDS, up to 9 indicators per field/keyword via up to 3
     * physical lines of up to 3 indicators each.
     */
    static parseConditionalLine(conditionColumns: string): {
        relator: `A` | `O`;
        indicators: Conditional[];
    };
    /**
     * Folds one physical line's conditioning columns into an in-progress
     * ConditionGroup[] - a fresh group on 'O' (or if there's no group yet,
     * since a leading 'O' is illegal DDS and is treated as blank), otherwise
     * extended onto the current (AND'd) group. A line with no indicators at
     * all contributes nothing (covers blank continuation lines cleanly).
     */
    static appendConditionLine(groups: ConditionGroup[], conditionColumns: string): void;
    /** Line breaks are threaded through the keyword scanner as characters,
     * so they have to be ones that can never turn up in real DDS source -
     * a printable marker (a '~' in a constant, say) would be swallowed as a
     * line break and shift every conditioning line after it. */
    private static readonly NEW_LINE_MARK;
    private static readonly CONTINUED_MARK;
    /**
     * Joins one field's (or record's) functions-area lines into the single
     * string parseKeywords scans, resolving DDS continuations as it goes.
     *
     * A `+` or `-` as the last character of the functions area continues the
     * entry on the next line rather than ending it:
     *
     *   `-`  resumes at position 45 exactly, blanks included - so the split
     *        can fall anywhere at all, mid-word or inside a quoted literal,
     *        and the two halves rejoin exactly as written.
     *   `+`  resumes at the next line's first NON-blank character, which is
     *        how a multi-value keyword is usually coded (the continuation is
     *        indented to line up under the value above it).
     *
     * Either way the entry runs straight on across the break, so the break is
     * emitted as CONTINUED_MARK - the scanner keeps building the same word or
     * literal through it, where a NEW_LINE_MARK would have ended it. A
     * trailing `+`/`-` on the very last line has nothing to continue onto, so
     * it's ordinary text.
     */
    static joinKeywordLines(keywordStrings: string[]): string;
    /**
     * @param firstConditionalLine The first conditioningStrings line a
     *   keyword is allowed to claim - for a FIELD's keywords this is 2, since
     *   line 1 is always the field's own definition line and its conditioning
     *   columns belong to the field itself (see FieldInfo.handleKeywords),
     *   never to a keyword. A record has no such reserved line, so its
     *   keywords (see RecordInfo.handleKeywords) start at 1.
     */
    static parseKeywords(keywordStrings: string[], conditionalStrings?: {
        [line: number]: string;
    }, firstConditionalLine?: number): {
        value: string;
        keywords: Keyword[];
        conditions: Conditional[];
    };
    /** DDS is fixed-column: a line's functions area (where keywords are
     * coded) is positions 45-80, i.e. 0-indexed 44 up to the 80-character
     * line length - the same slice parse() reads keywords back out of. */
    private static readonly FUNCTIONS_COLUMN;
    private static readonly FUNCTIONS_WIDTH;
    /**
     * Renders a ConditionGroup[] into DDS conditioning-indicator column
     * strings (10 chars each: 1 relator + up to 3 indicators of 3 chars) -
     * one per physical line needed. A group with more than 3 indicators
     * chunks onto several lines; only a group's own FIRST physical line
     * carries the 'O' relator (a group's own continuation is still the same
     * AND'd group). The first returned string is meant to sit inline with
     * the field/keyword's own text (its relator is always blank - the first
     * group is never itself OR'd to anything); every string after that
     * becomes its own continuation line.
     */
    private static conditionLines;
    static getLinesForKeyword(keyword: Keyword): string[];
    /**
     * Lays one entry - a keyword, or a constant's quoted literal - out across
     * the functions area (positions 45-80), continuing onto as many lines as
     * it takes rather than running past column 80, where DDS would truncate
     * it.
     *
     * Every continued line ends in a `-` in column 80, which resumes at
     * position 45 of the next line with nothing inserted between the two
     * halves: the split can fall anywhere - mid-word, between a keyword's
     * name and its `(`, or inside a quoted literal - and joinKeywordLines
     * puts it back together exactly as it was. `+` would be prettier for a
     * multi-value keyword, but it swallows the continuation's leading blanks,
     * so it can't carry a literal that happens to break on one.
     *
     * A continuation line carries no conditioning of its own: blank columns
     * fold in as nothing (see appendConditionLine), so the entry keeps
     * exactly the indicators coded on the line(s) before it.
     */
    private static wrapFunctions;
    static getLinesForField(field: FieldInfo): string[];
    getRangeForField(recordFormat: string, fieldName: string): DdsLineRange | undefined;
    updateField(recordFormat: string, originalFieldName: string | undefined, fieldInfo: FieldInfo): DdsUpdate | undefined;
    static getHeaderLinesForFormat(recordFormat: string, keywords: Keyword[]): string[];
    getHeaderRangeForFormat(recordFormat: string): DdsLineRange | undefined;
    /** Appends a brand-new, empty record format to the end of the file. */
    addFormat(name: string): DdsUpdate;
    /**
     * The full line range of a record format, from its 'R' line through its
     * last field/keyword line (inclusive) - i.e. everything that needs to be
     * removed to delete the format entirely. The file-level/global record has
     * no 'R' line of its own and can't be deleted this way.
     */
    getRangeForFormat(recordFormat: string): DdsLineRange | undefined;
    /**
     * Renames a record format by regenerating just its own 'R <name>' line -
     * every field/keyword line below it is untouched. The file-level/global
     * record has no 'R' line of its own and can't be renamed this way.
     */
    renameFormat(originalFormatName: string, newFormatName: string): DdsUpdate | undefined;
    updateFormatHeader(originalFormatName: string, keywords: Keyword[]): DdsUpdate | undefined;
}
export declare class RecordInfo {
    name: string;
    fields: FieldInfo[];
    range: DdsLineRange;
    isWindow: boolean;
    windowReference: string | undefined;
    windowSize: {
        y: number;
        x: number;
        width: number;
        height: number;
    };
    keywordStrings: {
        keywordLines: string[];
        conditionalLines: {
            [lineIndex: number]: string;
        };
    };
    keywords: Keyword[];
    constructor(name: string);
    handleKeywords(): void;
}
export interface Keyword {
    name: string;
    value?: string;
    conditions: ConditionGroup[];
}
export type DisplayType = "input" | "output" | "both" | "const" | "hidden";
export declare class FieldInfo {
    startRange: number;
    name?: string | undefined;
    value: string | undefined;
    type: string | undefined;
    primitiveType: "char" | "decimal" | undefined;
    displayType: DisplayType | undefined;
    length: number;
    decimals: number;
    position: {
        x: number;
        y: number;
    };
    /** Set only for a printer-file field with no Y coded - tells
     * DisplayFile.assignPrinterLines() it may compute this field's line. */
    needsPrinterLine: boolean;
    keywordStrings: {
        keywordLines: string[];
        conditionalLines: {
            [lineIndex: number]: string;
        };
    };
    conditions: ConditionGroup[];
    keywords: Keyword[];
    constructor(startRange: number, name?: string | undefined);
    handleKeywords(): void;
}
export interface Conditional {
    indicator: number;
    negate: boolean;
}
/** One AND-group of indicators - real DDS ORs these together, up to 3
 * groups (via continuation lines), 3 indicators AND'd within each. */
export interface ConditionGroup {
    indicators: Conditional[];
}
