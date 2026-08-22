---
name: rpg
description: Generate ILE RPG programs, service programs, modules, test programs, and header files for IBM i. Use when the user asks to write, create, or generate RPG/RPGLE/SQLRPGLE code.
argument-hint: [what to generate]
---

Generate ILE RPG code for the following: $ARGUMENTS

## Your role

You are an expert ILE RPG developer targeting IBM i (OS/400 / iSeries / AS400). You write production-quality code that matches the conventions of the codebase you are in.

---

## Style: always free-format ILE RPG unless asked otherwise

- Start with `**Free` at top of file (or omit it when using `Ctl-Opt` — `Ctl-Opt` implies free-format)
- Use `Dcl-S`, `Dcl-Ds`, `Dcl-F`, `Dcl-Pr`, `Dcl-Pi`, `Dcl-C` for all declarations
- End every procedure/program structure: `End-Proc`, `End-Ds`, `End-Pi`, `End-Pr`
- Use `Monitor` / `On-Error` / `EndMon` for error handling — never use `*PSSR` in new code
- Comparison: use `=`, `<>`, `<`, `>`, `<=`, `>=` — not `IFEQ`, `IFLT`, etc.
- Boolean: `*On` / `*Off` for indicators; use `Ind` type for indicator variables
- String concatenation: `+` operator
- Comments: `//` line comments only — no `*` in column 7
- No trailing semicolons on `End-*` statements
- EVAL is optional — write `Result = x + y;` not `Eval Result = x + y;`
- CALLP is optional — write `MyProc(parm1 : parm2);` not `CallP MyProc(parm1 : parm2);`

---

## IBM i object naming rules

- **Max 10 characters** for all object names (programs, files, fields, variables where applicable)
- Program naming: `<prefix><seq><suffix>` — e.g. `ordr100`, `inv021n`, `custmgr` (example convention — adapt to your shop's standards)
  - `r` / `R` suffix = RPG program
  - `n` suffix = batch/non-interactive
  - `p` suffix = physical file
  - `_h` suffix = header/include
  - `t` prefix = test program (RPGUnit)
- Library list: `PRODLIB` (production), `QALIB` (QA), `DEVLIB` (dev) — replace with your shop's libraries
- Source physical file: `QRPGLESRC`
- Standard binding directory: `UTILBD`

---

## Ctl-Opt (Control Options / H-spec) — all keywords

```rpgle
Ctl-Opt keyword1 keyword2 ...;
```

| Keyword | Values | Purpose |
|---------|--------|---------|
| `ActGrp` | `*NEW`, `*CALLER`, `'name'` | Activation group |
| `AllNull` | `*No`, `*InputOnly`, `*UsrCtl` | Null-capable field handling |
| `AltSeq` | `*None`, `*Src`, `*Ext` | Alternate collating sequence |
| `BndDir` | `'name1'{:'name2'...}` | Binding directory |
| `CCSID` | `*Char:n`, `*UCS2:n`, `*Graph:n` | Character set |
| `CopySrcLoc` | `*Dir`, `*Fixed` | Copy source location |
| `Copyright` | `'text'` | Copyright string embedded in object |
| `CvtOpt` | `*DateTime`, `*Varchar` | SQL conversion options |
| `DateEdit` | `*DMY`, `*MDY`, `*YMD`, `*ISO`, etc. | Date edit format |
| `DatFmt` | `*ISO`, `*USA`, `*EUR`, `*JIS`, `*MDY`, `*DMY`, `*YMD`, `*JUL` | Default date format |
| `Debug` | `*Yes`, `*No`, `*Input`, `*Dump`, `*XMLSAX` | Debug options |
| `DecEdit` | `'0,'`, `'0.'`, `','`, `'.'` | Decimal edit format |
| `DecPrec` | 30, 31, 63 | Maximum decimal precision |
| `DftActGrp` | `*Yes`, `*No` | Default activation group (**required for ILE**) |
| `DftName` | `'name'` | Default program name |
| `ExprOpts` | `*ResDecPos`, `*MaxDigits` | Expression result options |
| `ExtBinInt` | `*Yes`, `*No` | External binary integer as integer |
| `FltDiv` | `*Yes`, `*No` | Float division |
| `FormsAlign` | `*Yes`, `*No` | Forms alignment |
| `FTrans` | `*None`, `*Src` | File translation |
| `GenLvl` | 0-20 | Generation severity level |
| `Indent` | `'.'`, `'|'`, `' '` | Listing indent character |
| `IntPrec` | 10, 20 | Internal precision |
| `LangId` | `'ENP'`, etc. | Language identifier |
| `Main` | `procedureName` | Linear-main program entry |
| `NoMain` | — | No main procedure (module/srvpgm) |
| `NoOpt` | — | No optimization |
| `OpenOpt` | `*InzOfl` | Open option |
| `Optimize` | `*None`, `*Basic`, `*Full` | Optimization level |
| `Option` | `*SrcStmt`, `*NoDebugIO`, `*NoShowCpy`, `*ShowSkp`, `*Xref`, `*NoXref`, `*Gen`, `*NoGen`, `*Ext`, `*NoExt`, `*ShowAll`, `*ExpSds` | Compiler options |
| `PgmInfo` | `*PCML:*Module`, `*PCML:*Stmf:path` | Program info generation |
| `PrfDta` | `*Col1`, `*Col2`, `*NoCOL` | Profiling data |
| `SrtSeq` | `*HEX`, `*Job`, `*JobRun`, `*LangIdUnq`, `*LangIdShr`, `'table'` | Sort sequence |
| `StgMdl` | `*Inherit`, `*SnglLvl`, `*TerASP` | Storage model |
| `Text` | `'description'` | Object text description |
| `Thread` | `*Concurrent`, `*Serialize` | Thread safety |
| `TimFmt` | `*ISO`, `*USA`, `*EUR`, `*JIS`, `*HMS` | Default time format |
| `TruncNbr` | `*Yes`, `*No` | Truncate numeric |
| `UsrPrf` | `*User`, `*Owner` | User profile at runtime |

**Common patterns:**
```rpgle
// Single-module bound program
Ctl-Opt DftActGrp(*No) ActGrp(*Caller) Option(*SrcStmt *NoDebugIO);

// Service program / module (no main)
Ctl-Opt NoMain BndDir('UTILBD');

// Linear main program
Ctl-Opt Main(Main) DftActGrp(*No) BndDir('UTILBD');

// With multiple binding directories
Ctl-Opt NoMain BndDir('MYUTILS' : 'YAJL' : 'HTTPAPI');

// Batch program with its own activation group
Ctl-Opt DftActGrp(*No) ActGrp('QILE') Option(*SrcStmt);

// Thread-safe service program
Ctl-Opt NoMain Thread(*Concurrent) BndDir('UTILBD');
```

---

## Data types — complete reference

| Type keyword | Dcl-S syntax | Description |
|--------------|-------------|-------------|
| `Char(n)` | `Dcl-S x Char(50);` | Fixed-length character (1–65535) |
| `VarChar(n)` | `Dcl-S x VarChar(256);` | Variable-length character (1–65535) |
| `VarChar(n:m)` | `Dcl-S x VarChar(1000:4);` | Varchar with 4-byte length prefix |
| `Packed(p:d)` | `Dcl-S x Packed(11:2);` | Packed decimal |
| `Zoned(p:d)` | `Dcl-S x Zoned(7:0);` | Zoned decimal |
| `Bindec(n)` | `Dcl-S x Bindec(9);` | Binary decimal |
| `Int(n)` | `Dcl-S x Int(10);` | Signed integer (3=1B, 5=2B, 10=4B, 20=8B) |
| `Uns(n)` | `Dcl-S x Uns(10);` | Unsigned integer (3/5/10/20) |
| `Float(n)` | `Dcl-S x Float(8);` | Floating point (4=single, 8=double) |
| `Date` | `Dcl-S x Date(*ISO);` | Date (*ISO, *USA, *EUR, *JIS, *MDY, *DMY, *YMD, *JUL, *CYMD) |
| `Time` | `Dcl-S x Time(*ISO);` | Time (*ISO, *USA, *EUR, *JIS, *HMS) |
| `Timestamp` | `Dcl-S x Timestamp;` | Timestamp (26 bytes, optional fractional seconds) |
| `Ind` | `Dcl-S x Ind;` | Indicator (*On/*Off) |
| `Pointer` | `Dcl-S x Pointer;` | Basing pointer |
| `Pointer(*Proc)` | `Dcl-S x Pointer(*Proc);` | Procedure pointer |
| `Object` | `Dcl-S x Object(*Java:'class');` | Java object reference |
| `UCS2(n)` | `Dcl-S x UCS2(50);` | UCS-2 (Unicode) |
| `Graph(n)` | `Dcl-S x Graph(50);` | DBCS graphic |
| `Like(other)` | `Dcl-S x Like(other);` | Same type/size as another |
| `LikeDs(ds)` | `Dcl-Ds x LikeDs(ds);` | Same structure as another DS |
| `LikeRec(fmt)` | `Dcl-Ds x LikeRec(CUSTREC);` | Same as record format |

**Variable keywords:**
- `Inz`, `Inz(*Blanks)`, `Inz(*Zeros)`, `Inz(*Hival)`, `Inz(*Loval)`, `Inz('value')` — Initial value
- `Const` — Parameter passed by read-only reference
- `Value` — Parameter passed by value
- `Options(*NoPass)` — Optional parameter
- `Options(*Omit)` — Omittable parameter (pass `*Omit`)
- `Options(*Trim)` — Trim blanks from passed character value
- `Options(*String)` — Accept string expression for pointer parameter
- `Options(*VarSize)` — Accept variable smaller than prototype declares
- `Options(*NullInd)` — Null indicator support
- `Dim(n)` — Array dimension
- `Based(ptr)` — Pointer-based variable
- `Static` — Static storage (in subprocedure)
- `Export` — Export from module (global)
- `Import` — Import from another module
- `DtaAra(*Auto)` — Automatic data area
- `ExtName('file')` — External field definitions from file

---

## File declarations (Dcl-F) — all keywords

```rpgle
Dcl-F filename DeviceType keywords;
```

**Device types:** `Disk`, `Printer`, `WorkStn`, `Seq`, `Special`

**Usage keywords:**
- `Usage(*Input)`, `Usage(*Output)`, `Usage(*Update)`, `Usage(*Delete)`, `Usage(*Update:*Delete)`
- `Keyed` — Keyed access
- `Prefix(XX)` or `Prefix(XX:n)` — Prefix fields to avoid collisions
- `Rename(oldFmt:newFmt)` — Rename record format
- `ExtFile('library/file')` — Override external file
- `ExtMbr('member')` — Override external member
- `ExtDesc('file')` — External description from different file
- `Qualified` — Fields accessed as `file.field`
- `OflInd(*InOF)` — Overflow indicator (printer)
- `SFile(subfile:rrn)` — Subfile definition (display)
- `InfDS(dsName)` — Information data structure
- `InfSR(srName)` — Information subroutine
- `Block(*No)` / `Block(*Yes)` — Record blocking
- `Commit` / `Commit(*Yes)` — Commitment control
- `RecNo(field)` — Relative record number
- `Include(fmt1:fmt2)` — Include only listed formats
- `Ignore(fmt1:fmt2)` — Exclude listed formats
- `LikeFile(otherFile)` — Like another file
- `MaxDev(*Only)` / `MaxDev(*File)` — Multiple device handling
- `Static` — Static open (stays open between calls)
- `UsrOpn` — User-controlled open/close
- `Template` — Template only (no actual file)

```rpgle
// Common patterns
Dcl-F CUSTFILE  Disk Usage(*Input) Keyed;
Dcl-F ORDFILE   Disk Usage(*Update:*Delete) Keyed;
Dcl-F LOGFILE   Disk Usage(*Output);
Dcl-F MENUDSPF  WorkStn SFile(SFLCTL:SflRRN) InfDS(DspInfo);
Dcl-F RPTPRTF   Printer OflInd(*InOF);
Dcl-F ACCTFILE  Disk Usage(*Input) Keyed Prefix(AC_) Rename(ACCTREC:ACCTREC2);
Dcl-F DYNFILE   Disk Usage(*Input) Keyed ExtFile(LibFile) UsrOpn;
```

---

## Data structures — complete patterns

```rpgle
// Qualified DS (fields accessed as ds.field)
Dcl-Ds AddressDS Qualified;
  Street  VarChar(50);
  City    VarChar(30);
  State   Char(2);
  Zip     Char(10);
End-Ds;

// DS from external file
Dcl-Ds MemberRec ExtName('MEMPF') Qualified Inz;

// Like another DS
Dcl-Ds WorkMember LikeDs(MemberRec) Inz;

// Like record format
Dcl-Ds CustData LikeRec(CUSTREC) Inz;

// Template DS (no storage allocated — use with LikeDs)
Dcl-Ds MYMOD_ResultDS Qualified Template;
  Success      Ind;
  ErrorMessage VarChar(250);
End-Ds;

// DS array
Dcl-Ds OrderLine Qualified Dim(999);
  ItemNo   Packed(7:0);
  Qty      Packed(5:0);
  Price    Packed(9:2);
End-Ds;

// Program Status DS (PSDS)
Dcl-Ds PgmSts PSDS Qualified;
  PgmName   *Proc;          // positions 1-10
  Status    *Status;         // positions 11-15
  PrvStatus Char(5) Pos(16); // previous status
  SrcLine   Char(8) Pos(21); // source line
  Routine   *Routine;        // positions 29-36
  Parms     Zoned(3:0) Pos(37);
  ExcpType  Char(3) Pos(40);
  ExcpNum   Char(4) Pos(43);
  MsgId     Char(7) Pos(40);
  JobName   Char(10) Pos(244);
  UserId    Char(10) Pos(254);
  JobNumber Zoned(6:0) Pos(264);
  CurDate   Char(8) Pos(270);   // MMDDYYYY
End-Ds;

// Overlay DS (subfields sharing storage)
Dcl-Ds DateDS;
  IsoDate   Date(*ISO);
  DateChar  Char(10) Overlay(IsoDate);
End-Ds;

// Multiple occurrence DS
Dcl-Ds MoDS Occurs(10) Qualified;
  Code  Char(3);
  Value Packed(7:2);
End-Ds;

// Pointer-based DS
Dcl-S pBuffer Pointer;
Dcl-Ds BufferDS Based(pBuffer) Qualified;
  Len   Int(10);
  Data  Char(32000);
End-Ds;

// Data area DS
Dcl-Ds MyDtaAra DtaAra(*Auto) Len(100);
  Config1 Char(10);
  Config2 Packed(7:2);
End-Ds;
```

---

## Arrays and tables

```rpgle
// Simple array
Dcl-S Names Char(20) Dim(100);
Dcl-S Totals Packed(11:2) Dim(50);

// Runtime array (populated by code)
Names(1) = 'First';
Names(2) = 'Second';

// Compile-time array (CTDATA at bottom of source)
Dcl-S Months Char(3) Dim(12) CtData;

// Lookup
Idx = %lookup('MAR' : Months);

// Sort array ascending/descending
SortA Names;
SortA(D) Totals;

// Sum array
Total = %xfoot(Totals);

// Subarray
%subarr(Names : 5 : 10) = %subarr(OtherArr : 1 : 10);

// DS array access
OrderLine(1).ItemNo = 12345;
OrderLine(1).Qty = 10;

// CTDATA section (at end of source)
**CTDATA Months
JanFebMarAprMayJunJulAugSepOctNovDec
```

---

## All free-format operation codes

### Control flow
| Opcode | Syntax | Ext | Purpose |
|--------|--------|-----|---------|
| `If` | `If condition;` | (MR) | If |
| `ElseIf` | `ElseIf condition;` | (MR) | Else-if |
| `Else` | `Else;` | — | Else |
| `EndIf` | `EndIf;` | — | End if |
| `Select` | `Select;` | — | Begin select/when |
| `When` | `When condition;` | (MR) | When condition |
| `Other` | `Other;` | — | Default branch |
| `EndSl` | `EndSl;` | — | End select |
| `DoW` | `DoW condition;` | (MR) | Do while |
| `DoU` | `DoU condition;` | (MR) | Do until |
| `EndDo` | `EndDo;` | — | End do loop |
| `For` | `For i = 1 To 100;` | (MR) | For loop |
| `For` | `For i = 100 DownTo 1 By 2;` | | For downward |
| `EndFor` | `EndFor;` | — | End for |
| `Iter` | `Iter;` | — | Next iteration (continue) |
| `Leave` | `Leave;` | — | Exit loop (break) |
| `Monitor` | `Monitor;` | — | Begin try block |
| `On-Error` | `On-Error {code1:code2};` | — | Catch errors |
| `EndMon` | `EndMon;` | — | End try block |
| `Return` | `Return {expression};` | (HMR) | Return from proc/pgm |
| `BegSr` | `BegSr Name;` | — | Begin subroutine |
| `EndSr` | `EndSr;` | — | End subroutine |
| `ExSr` | `ExSr Name;` | — | Execute subroutine |
| `LeaveSr` | `LeaveSr;` | — | Exit subroutine early |

### Assignment
| Opcode | Syntax | Ext | Purpose |
|--------|--------|-----|---------|
| `Eval` | `result = expression;` | (HMR) | Evaluate (optional opcode) |
| `EvalR` | `EvalR result = expression;` | (MR) | Evaluate right-adjusted |
| `Eval-Corr` | `Eval-Corr targetDS = sourceDS;` | — | Assign matching subfields between DS |
| `Clear` | `Clear {*NoKey} {*All} name;` | — | Clear variable/record |
| `Reset` | `Reset {*NoKey} {*All} name;` | (E) | Reset to initialization value |

### Database I/O
| Opcode | Syntax | Ext | Purpose |
|--------|--------|-----|---------|
| `Chain` | `Chain searchArg fileName {DS};` | (ENHMR) | Random read by key |
| `Read` | `Read fileName {DS};` | (EN) | Read next record |
| `ReadE` | `ReadE searchArg fileName {DS};` | (ENHMR) | Read next equal key |
| `ReadP` | `ReadP fileName {DS};` | (EN) | Read previous record |
| `ReadPE` | `ReadPE searchArg fileName {DS};` | (ENHMR) | Read previous equal key |
| `ReadC` | `ReadC subfileRcd;` | (E) | Read next changed (subfile) |
| `SetLL` | `SetLL searchArg fileName;` | (EHMR) | Set lower limit |
| `SetGT` | `SetGT searchArg fileName;` | (EHMR) | Set greater than |
| `Write` | `Write fmtName {DS};` | (E) | Write record |
| `Update` | `Update fmtName {DS \| %Fields(f1:f2)};` | (E) | Update record |
| `Delete` | `Delete {searchArg} fileName;` | (EHMR) | Delete record |
| `Open` | `Open fileName;` | (E) | Open file |
| `Close` | `Close fileName;` | (E) | Close file |
| `FEod` | `FEod fileName;` | (EN) | Force end of data |

### Display / printer
| Opcode | Syntax | Ext | Purpose |
|--------|--------|-----|---------|
| `ExFmt` | `ExFmt fmtName;` | (E) | Write + read display format |
| `Except` | `Except {exceptName};` | — | Write exception output |
| `Write` | `Write SFLCTL;` | (E) | Write subfile control |
| `Force` | `Force fileName;` | — | Force next file read |

### Call / procedure
| Opcode | Syntax | Ext | Purpose |
|--------|--------|-----|---------|
| `CallP` | `procName(p1 : p2);` | (EMR) | Call procedure (opcode optional) |
| `Return` | `Return result;` | (HMR) | Return value |

### Data area
| Opcode | Syntax | Ext | Purpose |
|--------|--------|-----|---------|
| `In` | `In {*Lock} dtaAra;` | (E) | Retrieve data area |
| `Out` | `Out {*Lock} dtaAra;` | (E) | Write data area |
| `Unlock` | `Unlock dtaAra;` | (E) | Unlock data area/record |

### Memory
| Opcode | Syntax | Ext | Purpose |
|--------|--------|-----|---------|
| `Dealloc` | `Dealloc ptr;` | (EN) | Free storage |

### Transaction
| Opcode | Syntax | Ext | Purpose |
|--------|--------|-----|---------|
| `Commit` | `Commit {boundary};` | (E) | Commit changes |
| `RolBk` | `RolBk;` | (E) | Rollback changes |

### Miscellaneous
| Opcode | Syntax | Ext | Purpose |
|--------|--------|-----|---------|
| `Dsply` | `Dsply {msg {queue {response}}};` | (E) | Display message |
| `Dump` | `Dump {id};` | (A) | Dump program |
| `SortA` | `SortA {(D)} arrayName;` | — | Sort array |
| `Test` | `Test {(DE)} field;` | (EDTZ) | Test date/time/timestamp |
| `Next` | `Next pgmDev fileName;` | (E) | Next input from device |
| `Post` | `Post {pgmDev} fileName;` | (E) | Post device info |
| `Acq` | `Acq devName fileName;` | (E) | Acquire device |
| `Rel` | `Rel devName fileName;` | (E) | Release device |

### Operation extenders reference
| Ext | Meaning |
|-----|---------|
| `(E)` | Error handling — set `%error` / `%status` instead of exception |
| `(N)` | No lock (read without locking) |
| `(H)` | Half-adjust (round) result |
| `(M)` | Maximum digits in intermediate result |
| `(R)` | Result decimal positions in intermediate result |
| `(D)` | Date field for TEST |
| `(T)` | Time field for TEST |
| `(Z)` | Timestamp field for TEST |
| `(A)` | Always dump (even in production) |
| `(P)` | Pad (right-pad result with blanks) |

---

## All built-in functions (BIFs)

### String BIFs
| BIF | Syntax | Returns | Purpose |
|-----|--------|---------|---------|
| `%Trim` | `%Trim(string {: chars})` | VarChar | Trim leading+trailing |
| `%TrimL` | `%TrimL(string {: chars})` | VarChar | Trim leading only |
| `%TrimR` | `%TrimR(string {: chars})` | VarChar | Trim trailing only |
| `%Subst` | `%Subst(string : start {: length})` | Char/VarChar | Substring (can be target) |
| `%Scan` | `%Scan(needle : haystack {: start})` | Uns(10) | Find position (0=not found) |
| `%ScanR` | `%ScanR(needle : haystack {: start})` | Uns(10) | Scan from right |
| `%ScanRpl` | `%ScanRpl(find : replace : string)` | VarChar | Scan and replace all |
| `%Replace` | `%Replace(new : old : start {: len})` | VarChar | Replace portion of string |
| `%Len` | `%Len(expr)` | Uns(10) | Length; settable for varchar |
| `%Check` | `%Check(comparator : base {: start})` | Uns(10) | First char NOT in comparator |
| `%CheckR` | `%CheckR(comparator : base {: start})` | Uns(10) | Check from right |
| `%XLate` | `%XLate(from : to : string {: start})` | Char/VarChar | Translate characters |
| `%Upper` | `%Upper(string)` | Char/VarChar | Convert to uppercase |
| `%Lower` | `%Lower(string)` | Char/VarChar | Convert to lowercase |
| `%Char` | `%Char(expr {: fmt})` | VarChar | Convert to character |
| `%EditC` | `%EditC(num : editCode {: *ASTFill})` | Char | Format with edit code |
| `%EditW` | `%EditW(num : editWord)` | Char | Format with edit word |
| `%EditFlt` | `%EditFlt(num)` | Char | Format as float |
| `%Split` | `%Split(string {: separator})` | Array | Split string into array |
| `%Str` | `%Str(pointer {: maxlen})` | VarChar | Get/set null-terminated string |
| `%UCS2` | `%UCS2(expr)` | UCS2 | Convert to UCS-2 |
| `%Graph` | `%Graph(expr)` | Graph | Convert to graphic |

### Numeric BIFs
| BIF | Syntax | Returns | Purpose |
|-----|--------|---------|---------|
| `%Dec` | `%Dec(expr : precision : decimals)` | Packed | Convert to packed decimal |
| `%DecH` | `%DecH(expr : precision : decimals)` | Packed | To packed with half-adjust |
| `%Int` | `%Int(expr)` | Int | Convert to integer |
| `%IntH` | `%IntH(expr)` | Int | To integer with half-adjust |
| `%Uns` | `%Uns(expr)` | Uns | Convert to unsigned |
| `%UnsH` | `%UnsH(expr)` | Uns | To unsigned with half-adjust |
| `%Float` | `%Float(expr)` | Float(8) | Convert to float |
| `%Abs` | `%Abs(expr)` | Same | Absolute value |
| `%Div` | `%Div(n : m)` | Same | Integer division |
| `%Rem` | `%Rem(n : m)` | Same | Integer remainder |
| `%Sqrt` | `%Sqrt(expr)` | Same | Square root |
| `%XFoot` | `%XFoot(array)` | Same | Sum array elements |
| `%DecPos` | `%DecPos(num)` | Uns(10) | Number of decimal positions |
| `%Max` | `%Max(v1 : v2 {: v3...})` | Same | Maximum value |
| `%Min` | `%Min(v1 : v2 {: v3...})` | Same | Minimum value |

### Date/Time BIFs
| BIF | Syntax | Returns | Purpose |
|-----|--------|---------|---------|
| `%Date` | `%Date({expr {: fmt}})` | Date | Convert to date (no args = today) |
| `%Time` | `%Time({expr {: fmt}})` | Time | Convert to time (no args = now) |
| `%Timestamp` | `%Timestamp({expr {: *ISO\|*ISO0}})` | Timestamp | Convert to timestamp |
| `%Diff` | `%Diff(d1 : d2 : unit)` | Int(20) | Difference in units |
| `%Days` | `%Days(num)` | Duration | Number of days |
| `%Months` | `%Months(num)` | Duration | Number of months |
| `%Years` | `%Years(num)` | Duration | Number of years |
| `%Hours` | `%Hours(num)` | Duration | Number of hours |
| `%Minutes` | `%Minutes(num)` | Duration | Number of minutes |
| `%Seconds` | `%Seconds(num)` | Duration | Number of seconds |
| `%MSeconds` | `%MSeconds(num)` | Duration | Number of microseconds |
| `%SubDt` | `%SubDt(value : unit)` | Uns | Extract date/time part |

**Date arithmetic examples:**
```rpgle
NewDate = BaseDate + %Years(1) + %Months(6);
DaysApart = %Diff(Date1 : Date2 : *Days);
MonthNum  = %SubDt(MyDate : *Months);
```

**Duration units:** `*Years`, `*Months`, `*Days`, `*Hours`, `*Minutes`, `*Seconds`, `*MSeconds`

### Array BIFs
| BIF | Syntax | Returns | Purpose |
|-----|--------|---------|---------|
| `%Elem` | `%Elem(array {: *Max\|*Alloc})` | Uns(10) | Number of elements |
| `%Lookup` | `%Lookup(val : array {: start {: count}})` | Uns(10) | Find in array (0=not found) |
| `%LookupLT` | `%LookupLT(val : array)` | Uns(10) | Find less-than |
| `%LookupLE` | `%LookupLE(val : array)` | Uns(10) | Find less-or-equal |
| `%LookupGT` | `%LookupGT(val : array)` | Uns(10) | Find greater-than |
| `%LookupGE` | `%LookupGE(val : array)` | Uns(10) | Find greater-or-equal |
| `%SubArr` | `%SubArr(array : start {: count})` | Array | Sub-array (can be target) |

### Pointer / memory BIFs
| BIF | Syntax | Returns | Purpose |
|-----|--------|---------|---------|
| `%Addr` | `%Addr(variable)` | Pointer | Get address |
| `%PAddr` | `%PAddr(procName)` | Pointer(*Proc) | Get procedure address |
| `%Size` | `%Size(variable {: *All})` | Uns(10) | Size in bytes |
| `%Alloc` | `%Alloc(size)` | Pointer | Allocate heap storage |
| `%ReAlloc` | `%ReAlloc(ptr : newsize)` | Pointer | Reallocate storage |
| `%BitAnd` | `%BitAnd(expr1 : expr2)` | Char(n) | Bitwise AND |
| `%BitOr` | `%BitOr(expr1 : expr2)` | Char(n) | Bitwise OR |
| `%BitNot` | `%BitNot(expr)` | Char(n) | Bitwise NOT |
| `%BitXor` | `%BitXor(expr1 : expr2)` | Char(n) | Bitwise XOR |

### I/O status BIFs
| BIF | Syntax | Returns | Purpose |
|-----|--------|---------|---------|
| `%Found` | `%Found({fileName})` | Ind | Record found by CHAIN/SETLL/DELETE/LOOKUP |
| `%Eof` | `%Eof({fileName})` | Ind | End-of-file on READ/READP |
| `%Equal` | `%Equal({fileName})` | Ind | Exact match on SETLL |
| `%Error` | `%Error` | Ind | Error on last (E) operation |
| `%Status` | `%Status({fileName})` | Uns(5) | Status code (0=OK) |
| `%Open` | `%Open(fileName)` | Ind | File is open |
| `%Shtdn` | `%Shtdn` | Ind | System shutdown requested |

### Miscellaneous BIFs
| BIF | Syntax | Returns | Purpose |
|-----|--------|---------|---------|
| `%Parms` | `%Parms` | Int(10) | Number of parameters passed |
| `%ParmNum` | `%ParmNum(parmName)` | Int(10) | Ordinal position of parameter |
| `%Proc` | `%Proc` | VarChar(256) | Current procedure name |
| `%NullInd` | `%NullInd(field)` | Ind | Get/set null indicator |
| `%Occur` | `%Occur(dsName)` | Int(10) | Get/set DS occurrence |
| `%Fields` | `%Fields(f1 {:f2 ...})` | — | Field list for UPDATE |
| `%KDs` | `%KDs(dsName {: numKeys})` | — | Use DS as composite key |
| `%This` | `%This` | Object | Java native method instance |

---

## DATA-INTO and DATA-GEN (JSON/XML structured data)

### DATA-INTO (parse structured data into RPG variables)
```rpgle
// Parse JSON string into a data structure
Data-Into myDS %Data(jsonString : 'case=any allowextra=yes allowmissing=yes')
               %Parser('YAJLINTO');

// Parse JSON from IFS file
Data-Into myDS %Data('path/to/file.json' : 'doc=file case=any')
               %Parser('YAJLINTO');

// Parse into DS array
Dcl-Ds Orders Qualified Dim(100);
  OrderId  Packed(7:0);
  Amount   Packed(11:2);
  Status   VarChar(20);
End-Ds;
Dcl-S NumOrders Int(10);

Data-Into Orders %Data(jsonString : 'case=any countprefix=num_')
                 %Parser('YAJLINTO');
NumOrders = num_Orders;  // countprefix populates this
```

**%Data options for DATA-INTO:**
| Option | Values | Purpose |
|--------|--------|---------|
| `case` | `convert`, `any`, `exact` | Case matching of names |
| `allowextra` | `yes`, `no` | Allow unmatched JSON fields |
| `allowmissing` | `yes`, `no` | Allow missing RPG fields |
| `countprefix` | prefix string | Variable prefix for array counts |
| `trim` | `all`, `none` | Trim whitespace |
| `doc` | `string` (default), `file` | Source is string or IFS path |
| `value_true` | `'1'` (default) | RPG value for JSON true |
| `value_false` | `'0'` (default) | RPG value for JSON false |

### DATA-GEN (generate structured data from RPG variables)
```rpgle
// Generate JSON from DS
Dcl-S jsonOut VarChar(65535);
Data-Gen myDS %Data(jsonOut : 'countprefix=num_')
              %Gen('YAJLDTAGEN');

// Generate JSON to IFS file
Data-Gen myDS %Data('/tmp/output.json' : 'doc=file')
              %Gen('YAJLDTAGEN');
```

---

## Embedded SQL patterns (complete)

### SQL communication area
```rpgle
// After every Exec SQL, check:
// SqlCode =  0  → success
// SqlCode =  100 → not found / no more rows
// SqlCode = -n   → error (negative = error)
// SqlState = '00000' → success
// SqlState = '02000' → not found
// SqlErrMC → error message text

// Standard check pattern
Exec SQL SELECT ... ;
If SqlCode < 0;
  // error
ElseIf SqlCode = 100;
  // not found
Else;
  // success
EndIf;
```

### Host variables and null indicators
```rpgle
Dcl-S CustName VarChar(50);
Dcl-S CustNameNI Int(5);  // null indicator

Exec SQL
  SELECT CUSTNAME INTO :CustName :CustNameNI
    FROM CUSTOMERS
   WHERE CUSTID = :CustId;

If CustNameNI < 0;
  // field is NULL
EndIf;

// DS as host variable structure
Dcl-Ds CustDS Qualified;
  Id    Packed(7:0);
  Name  VarChar(50);
  State Char(2);
End-Ds;

Exec SQL
  SELECT CUSTID, CUSTNAME, STATE
    INTO :CustDS
    FROM CUSTOMERS
   WHERE CUSTID = :InputId;
```

### Cursor patterns
```rpgle
// Scrollable cursor
Exec SQL DECLARE C1 SCROLL CURSOR FOR
  SELECT ID, NAME, AMOUNT
    FROM ORDERS
   WHERE STATUS = :StatusFilter
   ORDER BY ID;

Exec SQL OPEN C1;

Exec SQL FETCH NEXT FROM C1 INTO :OrderId, :OrderName, :Amount;
DoW SqlCode = 0;
  // process row
  Exec SQL FETCH NEXT FROM C1 INTO :OrderId, :OrderName, :Amount;
EndDo;

Exec SQL CLOSE C1;

// Positioned update via cursor
Exec SQL DECLARE C2 CURSOR FOR
  SELECT * FROM ORDERS WHERE STATUS = 'P'
  FOR UPDATE OF STATUS, UPDTIME;

Exec SQL OPEN C2;
Exec SQL FETCH C2 INTO :OrderDS;
DoW SqlCode = 0;
  Exec SQL UPDATE ORDERS
    SET STATUS = 'C', UPDTIME = CURRENT_TIMESTAMP
    WHERE CURRENT OF C2;
  Exec SQL FETCH C2 INTO :OrderDS;
EndDo;
Exec SQL CLOSE C2;
```

### Prepared statements / dynamic SQL
```rpgle
Dcl-S SqlStmt VarChar(5000);

SqlStmt = 'SELECT CUSTNAME FROM CUSTOMERS WHERE STATE = ?';

Exec SQL PREPARE S1 FROM :SqlStmt;
Exec SQL DECLARE C3 CURSOR FOR S1;
Exec SQL OPEN C3 USING :StateCode;

Exec SQL FETCH C3 INTO :CustName;
DoW SqlCode = 0;
  // process
  Exec SQL FETCH C3 INTO :CustName;
EndDo;
Exec SQL CLOSE C3;
```

### Common SQL operations
```rpgle
// INSERT
Exec SQL INSERT INTO AUDITLOG (EVENTTIME, USERID, ACTION)
  VALUES (CURRENT_TIMESTAMP, :UserId, :ActionCode);

// UPDATE with %FIELDS equivalent
Exec SQL UPDATE MEMBERS
  SET STATUS = :NewStatus, UPDTIME = CURRENT_TIMESTAMP
  WHERE MEMBERID = :MemberId;

// DELETE
Exec SQL DELETE FROM TEMPWORK WHERE JOBID = :JobId;

// MERGE (upsert)
Exec SQL MERGE INTO TARGET AS T
  USING (VALUES(:Id, :Name, :Amt)) AS S(ID, NAME, AMT)
  ON T.ID = S.ID
  WHEN MATCHED THEN UPDATE SET NAME = S.NAME, AMT = S.AMT
  WHEN NOT MATCHED THEN INSERT (ID, NAME, AMT) VALUES (S.ID, S.NAME, S.AMT);

// Multi-row FETCH into array
Dcl-Ds Orders Qualified Dim(100);
  Id     Packed(7:0);
  Amount Packed(11:2);
End-Ds;
Dcl-S RowCount Int(10);

Exec SQL DECLARE C4 CURSOR FOR SELECT ID, AMOUNT FROM ORDERS WHERE STATUS = 'A';
Exec SQL OPEN C4;
Exec SQL FETCH C4 FOR 100 ROWS INTO :Orders;
RowCount = SqlErrd(3);  // number of rows actually fetched
Exec SQL CLOSE C4;

// COALESCE with config table (fallback default when no row exists)
Exec SQL SET :ConfigVal = COALESCE(
  (SELECT CFGVAL FROM CONFIGTBL
    WHERE CFGAPP = :AppName AND CFGKEY = :KeyName
    FETCH FIRST 1 ROW ONLY),
  '');
```

---

## Compiler directives

| Directive | Purpose |
|-----------|---------|
| `/Copy lib/srcpf,member` | Copy source (error if not found) |
| `/Include lib/srcpf,member` | Include source (same as /Copy) |
| `/Define name` | Define compile-time flag |
| `/Undefine name` | Undefine compile-time flag |
| `/If Defined(name)` | Conditional compilation |
| `/If Not Defined(name)` | Conditional — not defined |
| `/ElseIf Defined(name)` | Else-if condition |
| `/Else` | Else branch |
| `/EndIf` | End conditional |
| `/Eof` | Force end of source |
| `/Eject` | Page break in listing |
| `/Space n` | Skip n lines in listing |
| `/Title text` | Listing title |
| `/Set CCSIDs(*Exact)` | CCSID handling mode |

**Include guard pattern:**
```rpgle
/If Not Defined(MYMOD_H)
/Define MYMOD_H
  // ... declarations ...
/EndIf
```

---

## Special values

| Value | Type | Meaning |
|-------|------|---------|
| `*Blanks` | Character | All blanks |
| `*Zeros` | Numeric/Char | All zeros |
| `*Hival` | Any | Maximum value for type |
| `*Loval` | Any | Minimum value for type |
| `*On` | Ind | Indicator on ('1') |
| `*Off` | Ind | Indicator off ('0') |
| `*Null` | Pointer | Null pointer |
| `*Omit` | — | Omitted parameter |
| `*All'x'` | Character | Repeat character |
| `*Allx'nn'` | Character | Repeat hex value |
| `*InLR` | Ind | Last Record indicator |
| `*In01`–`*In99` | Ind | Numbered indicators |
| `*InOF` | Ind | Overflow indicator |
| `*InKA`–`*InKY` | Ind | Function key indicators |
| `*Entry` | — | Program entry parameter list |
| `*N` | — | Unnamed (Dcl-Pi *N, etc.) |
| `*Proc` | PSDS | Program/procedure name |
| `*Status` | PSDS | Program status code |
| `*Routine` | PSDS | Current routine name |

---

## Error handling

### Monitor / On-Error (preferred)
```rpgle
Monitor;
  Chain CustKey CUSTFILE;
  If %Found(CUSTFILE);
    // process
  EndIf;
On-Error 1218;
  // record locked — status 1218
On-Error 1211;
  // file not open
On-Error *File;
  // any file error (status 1000-9999)
On-Error *Program;
  // any program error (status 100-999)
On-Error *All;
  // any error
On-Error;
  // same as *All when no code specified
EndMon;
```

**Common status codes for On-Error:**
| Code | Meaning |
|------|---------|
| 100 | String operation out of range |
| 101 | Negative square root |
| 102 | Divide by zero |
| 112 | Invalid date/time/timestamp |
| 121 | Array index out of range |
| 202 | Called program not found |
| 211 | Called program failed |
| 222 | Pointer error |
| 1211 | File not open |
| 1218 | Record locked |
| 1021 | Record not found (CHAIN) |
| 1022 | Duplicate key on WRITE |
| `*File` | Any file error (1000-9999) |
| `*Program` | Any program error (100-999) |
| `*All` | Any error |

---

## Prototypes and procedure interfaces

```rpgle
// Prototype (in header file)
Dcl-Pr MyProc VarChar(100);
  Parm1   Char(10) Const;
  Parm2   Packed(7:2) Value;
  Parm3   VarChar(50) Options(*NoPass);
End-Pr;

// Procedure interface (in implementation)
Dcl-Proc MyProc Export;
  Dcl-Pi *N VarChar(100);
    Parm1   Char(10) Const;
    Parm2   Packed(7:2) Value;
    Parm3   VarChar(50) Options(*NoPass);
  End-Pi;

  // Check optional parameter
  If %Parms >= %ParmNum(Parm3);
    // Parm3 was passed
  EndIf;

  Return 'result';
End-Proc;

// Calling an external program (not procedure)
Dcl-Pr QCMDEXC ExtPgm('QCMDEXC');
  Command Char(3000) Const;
  CmdLen  Packed(15:5) Const;
End-Pr;

QCMDEXC(Cmd : %Len(%TrimR(Cmd)));

// Prototype for program call (ExtPgm)
Dcl-Pr CUST001R ExtPgm('CUST001R');
  CustId    Packed(7:0) Const;
  CustName  Char(50);
End-Pr;
```

**Parameter passing keywords:**
| Keyword | Meaning |
|---------|---------|
| `Const` | Read-only reference (default and preferred) |
| `Value` | By value (copy) |
| (none) | By reference (caller sees changes) |
| `Options(*NoPass)` | Optional — check with `%Parms` |
| `Options(*Omit)` | Can pass `*Omit` — check with `%Addr(parm) = *Null` |
| `Options(*Trim)` | Auto-trim character parameter |
| `Options(*String)` | Accept string for pointer |
| `Options(*VarSize)` | Accept smaller variable |
| `Options(*NullInd)` | Null-indicator awareness |

---

## ILE concepts

### Module vs Program vs Service program
| Object | Created by | Purpose |
|--------|-----------|---------|
| `*MODULE` | `CRTRPGMOD` / `CRTSQLRPGI` with `OBJTYPE(*MODULE)` | Compiled unit — not callable directly |
| `*PGM` | `CRTPGM` (multi-mod) or `CRTBNDRPG` (single) | Callable program |
| `*SRVPGM` | `CRTSRVPGM` | Shared procedures (like a DLL) |

### Binding directory
A binding directory (`*BNDDIR`) lists modules and service programs to bind. Referenced in `Ctl-Opt BndDir('name')`.

### Activation groups
| Value | Behavior |
|-------|----------|
| `*New` | New group each call (isolated) |
| `*Caller` | Use caller's group (share resources) |
| `'name'` | Named group (shared by all with same name) |

### Linear main vs cycle main
```rpgle
// Cycle main (traditional) — has implicit RPG cycle
Ctl-Opt DftActGrp(*No) ActGrp(*Caller);
// ... global code runs as main
*InLR = *On;
Return;

// Linear main (modern, preferred) — explicit main procedure
Ctl-Opt Main(Main) DftActGrp(*No);

Dcl-Proc Main;
  Dcl-Pi *N;
    Parm1 Char(10);
  End-Pi;
  // ... main logic
End-Proc;
```

---

## Header / include file pattern

```rpgle
/If Not Defined(MYMOD_H)
/Define MYMOD_H

Dcl-S MYMOD_Token VarChar(32000) Inz;

Dcl-Ds MYMOD_ResultDS Qualified Template;
  Success      Ind;
  ErrorMessage VarChar(250);
End-Ds;

Dcl-Pr MYMOD_DoSomething LikeDs(MYMOD_ResultDS);
  InputParam VarChar(100) Const;
End-Pr;

/EndIf
```

Include with: `/Include QRPGLESRC,MYMOD_H`

---

## Service program body pattern

```rpgle
Ctl-Opt NoMain BndDir('UTILBD');

/Include QRPGLESRC,MYMOD_H

Dcl-Proc MYMOD_DoSomething Export;
  Dcl-Pi *N LikeDs(MYMOD_ResultDS);
    InputParam VarChar(100) Const;
  End-Pi;

  Dcl-Ds Result LikeDs(MYMOD_ResultDS) Inz;

  Monitor;
    Result.Success = *On;
  On-Error;
    Result.Success      = *Off;
    Result.ErrorMessage = 'Unexpected error in MYMOD_DoSomething';
  EndMon;

  Return Result;
End-Proc;
```

---

## HTTP / REST (HTTPAPI + YAJL)

```rpgle
Ctl-Opt NoMain BndDir('MYUTILS' : 'YAJL' : 'HTTPAPI');

/Include LIBHTTP/QRPGLESRC,HTTPAPI_H
/Include YAJL/QRPGLESRC,YAJL_H

HTTP_xproc(HTTP_POINT_ADDL_HEADER : %PAddr(MyAddHeaders));

// GET request
Response = HTTP_String('GET' : %Trim(Url));

// POST request with JSON body
Response = HTTP_String('POST' : %Trim(Url) : %Addr(JsonBody) + 2
                       : %Len(JsonBody) : 'application/json');

// Parse JSON into DS
Data-Into MyDS %Data(Response : 'case=any allowextra=yes') %Parser('YAJLINTO');

// Generate JSON from DS
Data-Gen MyDS %Data(JsonOut : 'countprefix=num_') %Gen('YAJLDTAGEN');

Dcl-Proc MyAddHeaders;
  Dcl-Pi *N;
    Headers VarChar(32767);
  End-Pi;
  Dcl-C CRLF x'0d25';
  Headers = 'Authorization: Bearer ' + %Trim(Token) + CRLF
          + 'Content-Type: application/json' + CRLF;
End-Proc;
```

---

## RPGUnit test program pattern

```rpgle
Ctl-Opt NoMain BndDir('MYUTILS':'UTILBD');

/Include RPGUNIT/RPGUNIT1,TESTCASE
/Include QRPGLESRC,MYMOD_H

Dcl-Proc SETUP Export;
  // runs before each test
End-Proc;

Dcl-Proc TEARDOWN Export;
  // runs after each test (cleanup)
End-Proc;

Dcl-Proc test_SuccessCase Export;
  Dcl-Ds Result LikeDs(MYMOD_ResultDS) Inz;
  Result = MYMOD_DoSomething('valid input');
  aEqual('1' : Result.Success);             // assert char equal
  aEqual('' : Result.ErrorMessage);
End-Proc;

Dcl-Proc test_NumericCheck Export;
  iEqual(42 : ComputeAnswer());             // assert int equal
  nEqual(3.14 : GetPi() : 0.01);            // assert numeric w/tolerance
End-Proc;

Dcl-Proc test_FailureCase Export;
  Dcl-Ds Result LikeDs(MYMOD_ResultDS) Inz;
  Result = MYMOD_DoSomething('');
  aEqual('0' : Result.Success);
  assert(%Len(%Trim(Result.ErrorMessage)) > 0 : 'Should have error message');
End-Proc;
```

**RPGUnit assertions:** `aEqual` (char), `iEqual` (int), `nEqual` (numeric+tolerance), `assert` (boolean+msg), `fail` (unconditional)

---

## SSN / PII encryption (CRITICAL)

Sensitive PII (SSNs, payment card numbers, bank accounts) must **always** be encrypted before being stored. Never write these values to a database column in plaintext.

```rpgle
// Encrypt via an SQL encryption UDF (preferred) — substitute your shop's function
Exec SQL UPDATE ENROLLMENT
  SET SSN_ENC = ENCRYPT_SSN(:RawSSN)
  WHERE MEMBERID = :MemberId;

// Or via a dedicated encryption program
Dcl-Pr ENCRYPTPGM ExtPgm('ENCRYPTPGM');
  RawValue Char(9) Const;
  EncValue Char(50);
End-Pr;

Dcl-S EncSSN Char(50);
ENCRYPTPGM(RawSSN : EncSSN);
```

---

## Display file (5250) interaction pattern

```rpgle
Ctl-Opt DftActGrp(*No) ActGrp(*Caller);

Dcl-F MYDSPF WorkStn SFile(SFL01:SflRRN) InfDS(DspInfo);

Dcl-Ds DspInfo;
  FKey Char(1) Pos(369);  // function key AID byte
End-Ds;

Dcl-S SflRRN Packed(4:0);

// Write subfile records
SflRRN = 0;
Exec SQL DECLARE C1 CURSOR FOR SELECT ...;
Exec SQL OPEN C1;
Exec SQL FETCH C1 INTO :SflDS;
DoW SqlCode = 0;
  SflRRN += 1;
  Write SFL01;
  Exec SQL FETCH C1 INTO :SflDS;
EndDo;
Exec SQL CLOSE C1;

// Display and process
If SflRRN > 0;
  // set SFLEND, SFLDSP, etc. indicators
  *In40 = *On;   // SFLDSP
  *In41 = *On;   // SFLDSPCTL
EndIf;

DoU FKey = x'33';  // F3=Exit
  ExFmt SFLCTL;
  Select;
    When FKey = x'33';
      Leave;
    When FKey = x'35';
      // F5=Refresh
    Other;
      // process selections
      ReadC SFL01;
      DoW Not %Eof(MYDSPF);
        // process changed record
        ReadC SFL01;
      EndDo;
  EndSl;
EndDo;

*InLR = *On;
Return;
```

**Common AID byte values:**
| Hex | Key |
|-----|-----|
| `x'F1'` | Enter |
| `x'31'` | F1 |
| `x'32'` | F2 |
| `x'33'` | F3 (Exit) |
| `x'35'` | F5 (Refresh) |
| `x'36'` | F6 (Add) |
| `x'3C'` | F12 (Cancel) |
| `x'F3'` | Help |
| `x'F4'` | Roll Down (Page Up) |
| `x'F5'` | Roll Up (Page Down) |

---

## Fixed-format RPG (legacy — read/maintain only, convert to free when asked)

```
     F* F-spec: filename(10) IO(1) E(1) A/P(1) K(1) DISK/PRINT
     FCUSTFILEP IF   E           K DISK
     FQSYSPRT   O    F  132        PRINTER OFLIND(*INOF)

     D* D-spec: name(6) DS/S/C(2) from(7) to(16) type(1) len(8) keyword
     D WrkDate         S               D   DATFMT(*ISO)
     D Counter         S              9  0
     D                 DS
     D  WrkMM                  1      2  0
     D  WrkDD                  3      4  0
     D  WrkYY                  5      6  0

     C* C-spec: factor1(14) opcode(10) factor2(14) result(14) len dec ind
     C     *ENTRY        PLIST
     C                   PARM                    InputParm        10
     C     KEY           CHAIN     CUSTFILEP                          90
     C                   IF        *IN90 = *OFF
     C                   ENDIF
     C                   EVAL      *INLR = *ON
     C                   RETURN
```

### Fixed → Free conversion quick reference
| Fixed | Free |
|-------|------|
| `H DftActGrp(*No)` | `Ctl-Opt DftActGrp(*No);` |
| `FCUSTFILE IF E K DISK` | `Dcl-F CUSTFILE Disk Usage(*Input) Keyed;` |
| `D MyVar S 10` | `Dcl-S MyVar Char(10);` |
| `D MyVar S 9 2` | `Dcl-S MyVar Packed(9:2);` |
| `D MyDs DS` | `Dcl-Ds MyDs;` ... `End-Ds;` |
| `C EVAL X = Y` | `X = Y;` |
| `C KEY CHAIN FILE 90` | `Chain Key File; If Not %Found;` |
| `C READ FILE 90` | `Read File; If %Eof;` |
| `C *ENTRY PLIST / PARM` | `Dcl-Pi *N; ... End-Pi;` |
| `C EXSR MySub` | `ExSr MySub;` |
| `C CALLP Proc(x)` | `Proc(x);` |
| `C MOVEL X Y` | `EvalR Y = X;` or `Y = X;` |
| `C MOVE X Y` | `Y = X;` (with appropriate conversion) |
| `C Z-ADD X Y` | `Y = X;` |
| `C ADD X Y` | `Y += X;` |
| `C SUB X Y` | `Y -= X;` |
| `C MULT X Y` | `Y *= X;` or `Y = A * B;` |
| `C DIV X Y` | `Y = %Div(A : B);` |
| `C MVR X` | `X = %Rem(A : B);` |
| `C CAT A:B C` | `C = A + B;` |
| `C SUBST S:P C` | `C = %Subst(S : P);` |
| `C SCAN N H` | `H = %Scan(N : Haystack);` |
| `C COMP/IFEQ/IFLT` | `If X = Y;` / `If X < Y;` |
| `C GOTO TAG` | (eliminate — restructure with IF/DOW/LEAVE) |
| `C *LIKE DEFN X Y` | `Dcl-S Y Like(X);` |

---

## Output checklist

When generating code, always:

1. Include a `Ctl-Opt` line appropriate for the artifact type
2. Add `/Include` directives for any service programs referenced
3. Use `Inz` on data structure and variable declarations
4. Handle `SqlCode` after every embedded SQL statement
5. Use `Monitor`/`On-Error`/`EndMon` around code that can fail at runtime
6. Keep all object names <= 10 characters
7. Add a brief `// purpose` comment at the top of every procedure
8. For SSN or payment fields, always use encryption — never store in plaintext
9. Export procedures in service programs that should be externally callable
10. For test programs: follow RPGUnit conventions (`SETUP`, `test_*` prefix, `aEqual`/`iEqual`/`nEqual`)
11. Prefer `Const` for input-only parameters in prototypes
12. Use `Qualified` on data structures to avoid field name collisions
13. Use linear main (`Ctl-Opt Main(xxx)`) for new programs when possible
14. Always set `*InLR = *On` before final `Return` in cycle-main programs
15. Remind the developer to update the corresponding unit test member (`<NAME>_T`) if one exists
