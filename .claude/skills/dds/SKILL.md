---
name: dds
description: Generate and validate IBM DDS (Data Description Specifications) source for Physical Files (.pf), Logical Files (.lf), Display Files (.dspf), and Printer Files (.prtf) for IBM i. Use when the user asks to write, create, generate, or validate DDS code.
argument-hint: [what to generate or validate]
---

Generate or validate IBM DDS code for the following: $ARGUMENTS

## Your role

You are an expert IBM i DDS developer. You write production-quality, column-accurate DDS source that compiles without errors on IBM i. You validate existing DDS for correctness, flag problems, and suggest fixes.

---

## DDS fixed-format source layout

Every DDS source line is exactly 80 characters wide. **Column positions are critical** — wrong columns cause compile errors.

```
|Col 1-5 |Col 6|Col 7-16    |Col 17|Col 18-19|Col 20|Col 21-29|Col 30-34|Col 35|Col 36|Col 37-38|Col 39-41|Col 42-44|Col 45-80       |
|Seq/cond |Form |Name        |Ref   |Reserved |Order |DataType |Length   |Dec   |Usage |Line     |Position |Reserved|Keywords        |
```

| Position | Field | Notes |
|----------|-------|-------|
| 1–5 | Sequence / conditioning | Usually blank. `*` in col 5 = comment |
| 6 | Form type | Always `A` |
| 7–16 | **Name** | Field name, file-level: blank. Left-justified, max 10 chars |
| 17 | Reference | `R` = field defined by reference (from REFFILE/REF); blank = local |
| 18–19 | Reserved | Blank |
| 20 | Order | `A`=ascending, `D`=descending (logical file key fields only) |
| 21–29 | Data type | See data types table below |
| 30–34 | Length | Right-justified numeric |
| 35 | Decimal | Decimal positions for numeric fields |
| 36 | Usage | `I`=input, `O`=output, `B`=both, `H`=hidden, `M`=message, `P`=prog-to-sys |
| 37–38 | Line | Line number on screen/printer (display/printer files) |
| 39–41 | Position | Column position on screen/printer |
| 42–44 | Reserved | Blank |
| 45–80 | **Keywords** | DDS function keywords |

**Record format designator line:** Name (col 7–16) = blank; `R` appears at col 17; record format name at col 19–28.

**Key field line:** `K` at col 18; field name at col 19–28. No data type, length, or usage.

**Select/Omit line:** `S` or `O` at col 18; field name at col 19–28; comparison keyword in col 45+.

**Join specification:** `J` at col 18; `JFLD` keyword in col 45+.

**Continuation lines:** When keywords exceed 80 columns, end with `-` and continue on the next line (col 45+). Multi-value continuations use `+` before closing paren:

```dds
     A                                          COLHDG('FIRST' 'SECOND' +
     A                                                 'THIRD')
     A                                          WDWTITLE((*TEXT 'Transaction Detail-
     A                                          s') (*COLOR WHT))
     A                                          ROLLUP(80 'READ PREVIOUS INTAKE MST-
     A                                          R REC.')
```

- `-` at end of col 80 = word is split (continuation at start of next col 45+)
- `+` before `)` = continuation of value list (next line col 45+)

---

## Data types (col 21–29)

| Code | Type | Notes |
|------|------|-------|
| `A` | Character | Default if blank and no decimals; `len` in cols 30–34 |
| `S` | Zoned decimal | `len` + decimal positions |
| `P` | Packed decimal | `len` + decimal positions |
| `B` | Binary | 2-byte (len ≤ 4) or 4-byte (len 5–9) |
| `F` | Float | Single (4) or double (8) |
| `L` | Date | No length/decimal; DATFMT keyword controls format |
| `T` | Time | No length/decimal; TIMFMT keyword controls format |
| `Z` | Timestamp | No length/decimal; always 26 chars internally |
| `N` | Indicator | 1-char, values `0`/`1` |
| (blank) | Character default | Same as `A` if no decimal positions |
| `M` | (display only) | Max-length character field |

---

## Physical File (.pf) — `CRTPF`

```dds
     A*                                         Description of file purpose
     A                                          REF(FLDREF)
     A          R RMYRECORD                     TEXT('MY TABLE DESCRIPTION')
     A            MYKEY         10              TEXT('PRIMARY KEY')
     A                                          COLHDG('KEY')
     A            MYNAME        30              TEXT('NAME FIELD')
     A                                          COLHDG('NAME')
     A            MYAMT          9  2           TEXT('DOLLAR AMOUNT')
     A                                          COLHDG('AMOUNT')
     A            MYDATE          L             TEXT('DATE FIELD')
     A                                          DATFMT(*ISO)
     A                                          COLHDG('DATE')
     A            MYSTATUS        1             TEXT('STATUS CODE')
     A                                          COLHDG('STATUS')
     A          K MYKEY
```

### Physical file rules and keywords

- **UNIQUE** (file level, col 45+): enforces no duplicate key values
- **REF(file)** or **REF(lib/file)**: inherit field definitions from reference file
- **REFFILE(file)**: same as REF but older syntax
- **TEXT(...)**: description of record format or field (max 50 chars)
- **COLHDG(...)**: column heading(s) for query tools (up to 3 quoted strings)
- **DATFMT(\*ISO|\*MDY|\*DMY|\*YMD|\*JUL|\*EUR|\*USA|\*JIS)**: date format
- **TIMFMT(\*HMS|\*ISO|\*USA|\*EUR|\*JIS)**: time format
- Field names and record format names: max **10 characters**, no spaces
- **ALWNULL**: allow null-capable fields
- **CCSID(n)**: character set identifier (37 = EBCDIC US)
- `p` suffix convention for file names (e.g., `custmbrp`, `acctctlp`)
- One record format per physical file (with rare exceptions)
- Referenced fields (col 17 = `R`): inherit type/length from REFFILE — no length/type needed
- Timestamp fields (`Z` type): no length, always 26 bytes internal — use for audit trails

### Key field rules

- `K` designator: can have multiple key fields (composite key), each on its own line
- Key fields are listed in key priority order (primary key field first)
- No data type, length, or decimal on key field lines
- For descending key: `D` in col 20

---

## Logical File (.lf) — `CRTLF`

### Simple logical file (alternate key path)

```dds
     A          R RMYRECORD                     PFILE(MYPHYFILE)
     A          K MYDATE
     A          K MYKEY
```

### Logical file with select/omit

```dds
     A          R RSELREC                       PFILE(MYPHYFILE)
     A          S MYSTATUS                      CMP(EQ 'A')
     A          K MYKEY
```

### Logical file with subset of fields

```dds
     A          R RMYREC                        PFILE(MYPHYFILE)
     A            MYKEY
     A            MYNAME
     A            MYAMT
     A          K MYNAME
     A          K MYKEY
```

### Join logical file (two physical files)

```dds
     A                                          JFILE(PRIMARYPF SECONDPF)
     A          R RJOINREC
     A                                          JOIN(PRIMARYPF SECONDPF)
     A                                          JFLD(PKEYFIELD SKEYFIELD)
     A            PKEYFIELD
     A            PNAME
     A            SFIELD1
     A            SFIELD2
     A          K PKEYFIELD
```

### Logical file keywords

| Keyword | Use |
|---------|-----|
| `PFILE(file)` | Physical file this LF is based on |
| `JFILE(pf1 pf2)` | Join files (file level) |
| `JOIN(from to)` | Specify join pair within JFILE |
| `JFLD(f1 f2)` | Join field pair |
| `CMP(op value)` | Select/omit comparison: EQ, NE, LT, LE, GT, GE |
| `RANGE(lo hi)` | Select/omit range check |
| `VALUES(v1 v2 ...)` | Select/omit value list |
| `COMP(op value)` | Alternate of CMP |
| `DYNSLT` | Dynamic selection (defer to runtime) |
| `UNIQUE` | Disallow duplicate key values |
| `REFFLD(fieldname)` | Reference a field from the REF file (use on LF field line) |

**Omit vs Select:** Use `S` for records to **include**; use `O` for records to **exclude**. Only one type per record format (all S or all O lines).

### Select/omit with VALUES (multi-value)

```dds
     A          R USRREC                        PFILE(MYLIB/MSGCTLP)
     A          K MSGMOD
     A          K MSGREC
     A          S MSGREC                        VALUES('ALERT   ' 'NOTICE  ' +
     A                                                 'REWORK  ')
```

---

## Display File (.dspf) — `CRTDSPF`

### File-level keywords (col 45+, name and ref blank)

```dds
     A                                          DSPSIZ(24 80 *DS3)
     A                                          MSGLOC(24)
     A                                          INDARA
     A                                          CHECK(RL)
     A                                          PRINT
     A                                          REF(FLDREF)
```

| Keyword | Meaning |
|---------|---------|
| `DSPSIZ(24 80 *DS3)` | 24x80 display (standard); use `27 132 *DS4` for wide |
| `MSGLOC(rn)` | Row where program messages appear |
| `INDARA` | Separate indicator area (recommended — avoids indicator conflicts) |
| `CHECK(RL)` | Right-to-left cursor movement |
| `PRINT` | Allow print key |
| `REF(file)` | Reference file for field definitions |
| `ERRSFL` | Error subfile — use system message subfile |

### Record format header

```dds
     A          R FMT1
     A                                          CA03(03 'Exit')
     A                                          CA12(12 'Cancel')
     A                                          CA05(05 'Refresh')
```

### Constant (literal) text on screen

```dds
     A                                  1  2'PGMNAME'
     A                                          DSPATR(HI)
     A                                  1 22'Title of Screen'
     A                                          COLOR(WHT)
     A                                          DSPATR(HI)
```

Format: `'literal text'` at position col 45+ with line/position in cols 37–41.

### System-supplied fields (no length needed)

```dds
     A                                  1 70DATE
     A                                          EDTCDE(Y)
     A                                          DSPATR(HI)
     A                                  2 70TIME
     A                                          DSPATR(HI)
     A                                  3  2USER
     A                                          DSPATR(HI)
```

### Input/output fields

```dds
     A            CUSTNO        10  0B  6 20
     A                                          EDTCDE(3)
     A                                          COLOR(TRQ)
     A            CUSTNAM       30   I  7 20
     A                                          DSPATR(HI)
     A            STATUS         1   O  8 20
     A                                          VALUES('A' 'I' 'S')
```

Usage codes: `I`=input only, `O`=output only, `B`=both (input+output), `H`=hidden, `M`=message field, `P`=program-to-system.

### Conditional indicators (col 1–5 area)

```dds
     A  50                              6 20'Protected field label'
     A                                          DSPATR(ND)
     A N50                                      DSPATR(PC)
     A  30                              8 20'Error Message'
     A                                          COLOR(RED)
```

- `  50` = indicator 50 ON activates this entry
- ` N50` = indicator 50 OFF activates this entry
- Conditioning indicators occupy cols 1–3 (up to 3 indicators AND-ed together)

### Command/function key keywords

| Keyword | Indicator set |
|---------|--------------|
| `CA03(03 'Exit')` | Cmd Attn — no data returned |
| `CF03(03 'Exit')` | Cmd Function — data is returned |
| `CA12(12 'Cancel')` | Cmd Attn key 12 |
| `ROLLUP(25 'PageDown')` | Roll up / Page Down |
| `ROLLDOWN(26 'PageUp')` | Roll down / Page Up |

### DSPATR (display attribute) values

| Value | Meaning |
|-------|---------|
| `HI` | High intensity (bright) |
| `BL` | Blink |
| `UL` | Underline |
| `RI` | Reverse image |
| `ND` | Non-display (blanked) |
| `PR` | Protected (no input) |
| `PC` | Position cursor here |
| `CS` | Column separator |
| `MDT` | Modified data tag (forces field to transmit) |

### COLOR values (display files only)

`GRN` (default), `WHT`, `RED`, `TRQ` (turquoise/cyan), `YLW`, `PNK`, `BLU`

### EDTCDE values (edit code)

| Code | Format produced |
|------|----------------|
| `1` | No sign, no comma, no zero suppression |
| `2` | No sign, comma, no zero suppression |
| `3` | No sign, no comma, zero suppression |
| `4` | No sign, comma, zero suppression |
| `J` | CR for negative, no comma |
| `K` | CR for negative, comma |
| `L` | CR for negative, no comma, zero suppression |
| `M` | CR for negative, comma, zero suppression |
| `N` | Minus for negative, no comma |
| `O` | Minus for negative, comma |
| `P` | Minus for negative, no comma, zero suppression |
| `Q` | Minus for negative, comma, zero suppression |
| `Y` | Date format (slashes) |
| `Z` | Suppress leading zeros, no sign |

### CHECK values (display files)

| Value | Meaning |
|-------|---------|
| `AB` | Allow blank (bypass required-entry check) |
| `ER` | Erase to end of field on first keystroke |
| `RB` | Right-to-left blank fill |
| `RL` | Right-to-left entry |
| `MF` | Mandatory fill (all positions must be filled) |
| `ME` | Mandatory entry (at least one non-blank) |
| `LC` | Lowercase allowed |
| `VN` | Validate name (IBM naming conventions) |

### Subfile pattern

```dds
     A*  --- Subfile record format ---
     A          R SFLFMT                        SFL
     A            SFLSEL         1   B  8  2
     A            SFLDSPF       10   O  8  5
     A            SFLDESC       30   O  8 17

     A*  --- Subfile control record format ---
     A          R SFLCTL                        SFLCTL(SFLFMT)
     A                                          SFLSIZ(0100)
     A                                          SFLPAG(0015)
     A                                          OVERLAY
     A  71                                      SFLDSP
     A  71                                      SFLDSPCTL
     A  70                                      SFLCLR
     A  72                                      SFLEND(*MORE)
     A            SFLRRN         4S 0H          SFLRCDNBR(CURSOR)
     A                                          CA03(03 'Exit')
     A                                          CA12(12 'Cancel')
     A                                  1  2'SCREEN TITLE'
     A                                          DSPATR(HI)
     A                                  8  2'Sel'
     A                                          DSPATR(UL)
     A                                  8  5'Field'
     A                                          DSPATR(UL)
```

Subfile control keywords:

| Keyword | Purpose |
|---------|---------|
| `SFL` | Marks this record format as the subfile |
| `SFLCTL(sflfmt)` | Control record for the named subfile |
| `SFLSIZ(n)` | Total number of subfile records |
| `SFLPAG(n)` | Number of records per page |
| `SFLDSP` | Display subfile (usually conditioned on indicator) |
| `SFLDSPCTL` | Display control record |
| `SFLCLR` | Clear subfile (usually conditioned on indicator) |
| `SFLINZ` | Initialize subfile records |
| `SFLEND(*MORE\|*PLUS)` | Display "More..." or "+" at bottom |
| `SFLRCDNBR(CURSOR)` | Position subfile to record number |
| `OVERLAY` | Don't clear screen when displaying this record |

### Popup window display (WINDOW keyword)

```dds
     A          R FMT01W
     A                                          WINDOW(10 2 12 75 *NOMSGLIN)
     A                                          CA12(12 'Close')
     A                                          WDWBORDER((*COLOR BLU) (*DSPATR RI)-
     A                                           (*CHAR '        '))
     A                                          WDWTITLE((*TEXT 'Transaction Detail-
     A                                          s') (*COLOR WHT))
     A                                          WDWTITLE((*TEXT 'F12=Close') (+
     A                                          *COLOR BLU) *BOTTOM)
```

| Keyword | Purpose |
|---------|---------|
| `WINDOW(startline startcol lines cols)` | Make record a popup window (origin + size) |
| `WINDOW(*DFT)` | System default window |
| `*NOMSGLIN` | No message line in window |
| `WDWBORDER(attrs)` | Window border attributes (color, display attr, chars) |
| `WDWTITLE(attrs)` | Window title bar — can specify `*BOTTOM` for bottom title |

### Error subfile (ERRSFL) pattern

```dds
     A          R ERRSFL                        SFL
     A            ZERR          67A  O 24  7COLOR(YLW)
     A                                          DSPATR(RI)
     A          R ERRCTL                        SFLCTL(ERRSFL)
     A                                          OVERLAY
     A  96                                      SFLDSP
     A  97                                      SFLCLR
     A  96                                      SFLEND
     A                                          SFLSIZ(0010)
     A                                          SFLPAG(0001)
```

Used for displaying error messages at the bottom of the screen. Indicator 96 controls display, 97 controls clear.

### EDTWRD (edit word) common patterns

| Pattern | Produces | Use |
|---------|----------|-----|
| `EDTWRD('    /  /  ')` | `YYYY/MM/DD` | 8-digit date as date |
| `EDTWRD('  /  /  ')` | `MM/DD/YY` | 6-digit date |
| `EDTWRD('  :  :  ')` | `HH:MM:SS` | 6-digit time |
| `EDTWRD('   -  -    ')` | `999-99-9999` | SSN/phone format |
| `EDTWRD('(   )   -    ')` | `(999) 999-9999` | Phone w/ area code |
| `EDTWRD('  /  / 0')` | Leading zero suppress | Date with zero-fill |

Edit word rules:
- Spaces = digit replacement positions (one space per digit)
- Characters = inserted literally (/, -, etc.)
- `0` = stop zero suppression at this point
- `&` = insert a blank in the output

### ROLLUP / ROLLDOWN (page up/down)

```dds
     A                                          ROLLUP(25 'Page Down')
     A                                          ROLLDOWN(26 'Page Up')
```

- `ROLLUP(ind 'text')` — Page Down key; sets indicator `ind` on
- `ROLLDOWN(ind 'text')` — Page Up key; sets indicator `ind` on
- Often used with subfile paging in SFLCTL records

### CHANGE keyword (detect field modification)

```dds
     A                                          CHANGE(79 'CHANGE DATA FIELD.')
```

Sets indicator 79 when any input field in the record format is modified.

### Referenced fields (REFFLD keyword)

When a physical file uses `REF(reffile)` at file level, individual fields can inherit definitions:

```dds
     A                                          REF(FLDREF)
     A          R RMYRECORD
     A            MYCUST    R                   REFFLD(CUSTNO)
     A            MYLOC     R                   REFFLD(LOCNO)
     A            MYDEPT    R                   REFFLD(DEPTNO)
     A            MYLOCAL       30              TEXT('LOCAL FIELD')
```

- `R` in col 17 = referenced field
- `REFFLD(name)` = name of the field in the reference file to copy definition from
- `REFFLD(name lib/file)` = reference from a specific file

### Message subfile (SFLMSG) pattern

```dds
     A          R SFL                           SFL
     A                                          SFLMSGRCD(24)
     A            MSGKEY                        SFLMSGKEY
     A            PGMMSGQ                       SFLPGMQ
     A          R SFLCTL                        SFLCTL(SFL)
     A                                          SFLSIZ(0010)
     A                                          SFLPAG(0001)
     A  99                                      SFLDSP
     A                                          SFLDSPCTL
     A  99                                      SFLINZ
     A            PGMMSGQ                       SFLPGMQ(10)
```

### Menu screen pattern

```dds
     A                                          DSPSIZ(24 80 *DS3)
     A                                          MSGLOC(24)
     A                                          PRINT
     A          R MENUFMT
     A                                          CA03(03 'Return')
     A                                          CA04(04 'Messages')
     A                                          BLINK
     A                                  1  2'MYMENU'
     A                                  1 21'***    Example Company, Inc.     -
     A                                      ***'
     A                                          DSPATR(HI)
     A                                          COLOR(TRQ)
     A                                  1 67'Date:'
     A                                          DSPATR(HI)
     A                                  1 73DATE
     A                                          EDTCDE(Y)
     A                                  2  2'MYPGM'
     A                                  2 20'My Application Menu'
     A                                          DSPATR(HI)
     A                                          COLOR(WHT)
     A                                  2 67'Time:'
     A                                          DSPATR(HI)
     A                                  2 73TIME
     A                                  6 31'Entry Options'
     A                                          DSPATR(HI)
     A                                          DSPATR(UL)
     A                                  7 22'01  Option Description One'
     A                                  8 22'02  Option Description Two'
     A                                  9 22'03  Option Description Three'
     A                                 12 31'Report Options'
     A                                          DSPATR(HI)
     A                                 13 22'10  Report Description One'
     A                                 21 32'90'
     A                                          DSPATR(HI)
     A                                          COLOR(TRQ)
     A                                 21 36'Signoff'
     A                                          DSPATR(HI)
     A                                          COLOR(TRQ)
     A                                 22 30'Enter Option'
     A            OPTION         2N 0I 22 43DSPATR(HI)
     A                                          CHECK(ER)
     A                                          CHECK(RB)
     A                                 23 17'F3-Exit'
     A                                          DSPATR(HI)
```

---

## Printer File (.prtf) — `CRTPRTF`

```dds
     A          R HEADNG
     A            TPROGNM       10   O  1  1
     A                                  1  1'DATE:'
     A            TDATE           L  O  1  7DATFMT(*USA)
     A                                  1 19'TIME:'
     A            TTIME           T  O  1 25TIMFMT(*USA)
     A                                  1 99'Page'
     A                                  1104PAGNBR
     A                                          EDTCDE(Z)
     A          R DETLINE
     A            DFIELD1       10   O     1SPACEB(1)
     A            DFIELD2       30   O    +1
     A            DAMOUNT        9  2O    +3EDTCDE(J)
     A          R TOTALLN
     A                                     1SPACEB(2)
     A            TTOTAL         9  2O     5EDTCDE(J)
     A                                      DSPATR(UL)
```

### Printer file keywords

| Keyword | Meaning |
|---------|---------|
| `SPACEB(n)` | Space n lines **before** printing |
| `SPACEA(n)` | Space n lines **after** printing |
| `SKIPB(n)` | Skip to line n **before** printing |
| `SKIPA(n)` | Skip to line n **after** printing |
| `PAGNBR` | System-supplied page number field |
| `DATFMT(*USA\|*ISO\|*MDY)` | Date format for L fields |
| `TIMFMT(*USA\|*HMS\|*ISO)` | Time format for T fields |
| `EDTCDE(code)` | Numeric edit code (same codes as display) |
| `EDTWRD('...')` | Custom edit word (e.g., `'    /  /  '` for dates) |
| `PRINTER` | File level — must be printer |
| `PAGESIZE(lines cpi lpi)` | Override page dimensions |
| `OVRFLW(n)` | Overflow line number |

**Position notation in printer files:**
- Absolute: `O line col` — e.g., `O  3  7` (line 3, col 7)
- Relative: `+n` after previous field — e.g., `+1` = 1 col after previous

### Complete printer file example (132-column report)

```dds
     A*  Monthly billing summary report
     A*  CRTPRTF PAGESIZE(66 132) OVRFLW(60)
     A          R HEADNG
     A                                  1  1'PROG:'
     A            TPROGNM       10   O  1  7
     A                                  1 19'USER:'
     A            TUSERNM       10   O  1 25
     A                                  1123'PAGE'
     A                                  1128PAGNBR
     A                                  2  1'DATE:'
     A            TDATE           L  O  2  7DATFMT(*USA)
     A                                  2 19'TIME:'
     A            TTIME           T  O  2 25TIMFMT(*USA)
     A            THEADING      50   O  2 40
     A                                  4  4'ASSOC #'
     A                                  4 14'ASSOC NAME'
     A                                  4 60'AMOUNT'
     A                                  4 75'STATUS'
     A          R DETLINE
     A            DASSOC         9  0O     4SPACEB(1)
     A                                          EDTCDE(3)
     A            DNAME         40   O    +2
     A            DAMOUNT        9  2O    +4EDTCDE(J)
     A            DSTATUS        1   O    +4
     A          R TOTALLN
     A                                    50SPACEB(2)
     A                                          'TOTAL:'
     A            TTOTAL        11  2O    +1EDTCDE(K)
     A                                          DSPATR(UL)
```

### Printer overflow handling

For page-break handling, use `OVRFLW` on the `CRTPRTF` command (not in DDS) and test the overflow indicator (`*INOF`) in the RPG program:
- Printer DDS defines record formats (heading, detail, total)
- RPG program checks `*INOF` after each WRITE to detect page full
- When `*INOF = *On`, WRITE the heading format, reset `*INOF = *Off`

---

## Physical file with REF and UNIQUE (complete example)

```dds
     A*  Billing cycle address file
     A                                          UNIQUE
     A                                          REF(FLDREF)
     A          R RBCYADDR                      TEXT('BILLING CYCLE ADDR')
     A            BCADATE         L             TEXT('BILLING CYCLE DATE')
     A                                          COLHDG('BILLING' 'CYCLE DATE')
     A                                          DATFMT(*ISO)
     A            BCACUST   R                   REFFLD(CUSTNO)
     A            BCALOC    R                   REFFLD(LOCNO)
     A            BCAADD1       30              TEXT('BILL TO ADDRESS 1')
     A                                          COLHDG('BILL TO' 'ADDRESS 1')
     A            BCAADD2       30              TEXT('BILL TO ADDRESS 2')
     A                                          COLHDG('BILL TO' 'ADDRESS 2')
     A            BCAMAMT        9  2           TEXT('BILLING AMOUNT')
     A                                          COLHDG('BILLING' 'AMOUNT')
     A            BCASTAMP        Z             TEXT('BILLING TIMESTAMP')
     A                                          COLHDG('BILLING' 'TIMESTAMP')
     A            BCASTAT        1              TEXT('PROCESSING STATUS')
     A                                          COLHDG('PROCESSING' 'STATUS')
     A          K BCADATE
     A          K BCACUST
     A          K BCALOC
```

---

## Compile commands

| File type | Command |
|-----------|---------|
| Physical file | `CRTPF FILE(lib/name) SRCFILE(lib/QDDSSRC) SRCMBR(name)` |
| Logical file | `CRTLF FILE(lib/name) SRCFILE(lib/QDDSSRC) SRCMBR(name)` |
| Display file | `CRTDSPF FILE(lib/name) SRCFILE(lib/QDDSSRC) SRCMBR(name)` |
| Printer file | `CRTPRTF FILE(lib/name) SRCFILE(lib/QDDSSRC) SRCMBR(name)` |

Libraries: `DEVLIB` (dev), `QALIB` (QA), `PRODLIB` (production) — replace with your shop's libraries.

---

## Naming conventions

- All object names: **max 10 characters** (IBM i hard limit)
- Physical files: `p` suffix — e.g., `acctctlp`, `mempf`
- Logical files: `l` or `l1..lN` suffix — e.g., `acctctl01`, `memagtl`
- Display files: `d` suffix — e.g., `accd100`, `membrd`
- Printer files: `p` or `prt`/`pr` suffix — e.g., `memrpt`, `acmrptr`
- Record format names: `R` prefix recommended — e.g., `RACCTCTL`, `RMEMREC`
- Field names: typically 2-char prefix matching file prefix — e.g., `ACBATCH`, `MEMNAME`

---

## Shop conventions (adapt to your standards)

- Maintain a central field reference file (e.g. `FLDREF`) and use `REF(FLDREF)` so field definitions stay consistent across all files
- PII fields (SSN, bank account numbers) must always be stored encrypted — never define them as plain unencrypted fields
- Standard screen size: `DSPSIZ(24 80 *DS3)` with `MSGLOC(24)`
- Screen header convention: line 1 = program/file ID at col 2–8, company name centered, DATE/TIME at right
- Function key row: line 23 (bottom of 24-line screen), col 3+

---

## Validation checklist

When **generating** DDS, always verify:

1. All object and field names are ≤ 10 characters
2. Record format name is present and unique within the file
3. Physical file has at least one key field (unless no-keyed access is intended)
4. Logical files specify `PFILE(...)` or `JFILE(...)` correctly
5. Join LFs have both `JOIN(...)` and `JFLD(...)` specifications
6. Select/omit lines (`S`/`O`) use valid `CMP`, `RANGE`, or `VALUES` keywords
7. Display file has `DSPSIZ(...)` at file level
8. Subfile pair: SFL record format comes **before** SFLCTL in source
9. `SFLSIZ` ≥ `SFLPAG` (usually SFLSIZ is a multiple of SFLPAG)
10. Screen fields don't overlap (line/position + field length must not exceed 80)
11. Numeric fields with decimals have matching data type (`P`, `S`, or `B`)
12. Date (`L`) and Time (`T`) fields have no length or decimal positions
13. Referenced fields (`R` in col 17) rely on REFFILE for type — omit type/length
14. Constant literals in display/printer files are in single quotes

When **validating** existing DDS, report:
- Name length violations
- Missing PFILE/JFILE on logical files
- Subfile keyword ordering problems
- Overlapping screen field positions
- Inconsistent select/omit types (mixing S and O in same format)
- Fields declared without a type where the type can't be inferred
- PII fields (SSN, bank account) defined as unencrypted character fields

---

## Common mistakes to avoid

- Using `CF` when you want `CA` (CF returns field data, CA does not — use CA for Exit/Cancel)
- Forgetting `OVERLAY` on subfile control when screen has other records on it
- Specifying length on `L`, `T`, or `Z` (date/time/timestamp) fields
- Putting `SFLCTL` before `SFL` in source (must be SFL record first)
- Using a field name longer than 10 chars (IBM i hard limit — no exceptions)
- Missing `PFILE` on logical file record format
- Incorrect column positions for screen constants (text appears in wrong place)
- Using `DSPATR(RI)` and `DSPATR(UL)` together (some combinations are unsupported)
- Forgetting `EDTCDE` or `EDTWRD` on numeric fields that should display formatted
- Using `S` (select) and `O` (omit) lines in the same record format — pick one approach
- Forgetting `DATFMT` on date fields — defaults to `*ISO` but be explicit for clarity
- Continuation lines: forgetting `-` at col 80 when a keyword value wraps to next line
- Setting SFLSIZ smaller than SFLPAG — will cause compile error
- Specifying a line number > 24 on a 24x80 display (or > 27 on a 27x132 display)
- Specifying a position > 80 (or >132 for wide) — field extends past screen edge
- Reusing the same record format name in the same file — format names must be unique
- Using `EDTCDE` and `EDTWRD` on the same field — they are mutually exclusive

---

## Output format

When generating DDS:
1. Output raw source text (no line numbers — the user will paste into SEU or RDi)
2. Pad to 80 columns if constants/keywords need specific alignment
3. Include a comment block at the top explaining the file's purpose
4. For display files: sketch the visual layout as a comment at the top
5. For printer files: note the expected line width (132 or 80 columns)
6. Flag any design decisions the user should review (e.g., key ordering, overflow line)
