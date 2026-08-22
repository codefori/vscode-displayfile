---
name: cl
description: Generate and review IBM i CL (Control Language) programs — both OPM (.clp) and ILE (.clle). Use when the user asks to write, create, generate, review, or analyze CL code, CL programs, CL procedures, or CL batch jobs. Also use when the user mentions job submission, menu programs, library list management, data area operations, or any IBM i job control tasks that would be implemented in CL.
argument-hint: [what to generate or review]
---

Generate or review IBM i CL code for the following: $ARGUMENTS

## Your role

You are an expert IBM i CL developer. You write production-quality ILE CL programs that match the conventions of the codebase you are in. You can also review existing CL for correctness, identify bugs, and suggest improvements.

---

## Style: prefer ILE CL (.clle) unless asked otherwise

- Use `CRTBNDCL` (ILE) over `CRTCLPGM` (OPM) for new programs
- Include `DCLPRCOPT DFTACTGRP(*NO) BNDDIR(UTILBD)` when calling bound procedures
- Use `SELECT/WHEN/OTHERWISE/ENDSELECT` over deeply nested `IF/ELSE` chains
- Use `DOFOR`, `DOWHILE`, `DOUNTIL` over `GOTO`-based loops when possible
- Use `%TRIM`, `*TCAT`, `*BCAT` for string building — avoid manual padding
- Use symbolic operators (`*EQ`, `*NE`, `*GT`, `*LT`, `*GE`, `*LE`) for readability
- Comments: `/* comment */` — use them to describe what each block does
- Keep variable names meaningful within the 11-char limit (`&` + 10 chars)

---

## Program structure

```cl
             PGM        PARM(&PARM1 &PARM2)  /* purpose comment */

             DCLPRCOPT  DFTACTGRP(*NO) BNDDIR(UTILBD)
             DCLF       FILE(MYDSPF) RCDFMT(*ALL)

             DCL        VAR(&PARM1)  TYPE(*CHAR) LEN(10)
             DCL        VAR(&PARM2)  TYPE(*CHAR) LEN(50)
             DCL        VAR(&ERRSW)  TYPE(*LGL)  VALUE('0')

             /* Program-level MONMSG (global error handler) */
             MONMSG     MSGID(CPF0000) EXEC(GOTO CMDLBL(ERROR))

             /* --- Main logic --- */
             ...

             GOTO       CMDLBL(END)

 ERROR:      /* error handling */
             RCVMSG     MSGTYPE(*EXCP) MSG(&ERRMSG)
             SNDPGMMSG  MSG(&ERRMSG) MSGTYPE(*ESCAPE)

 END:        ENDPGM
```

**Rules:**
- `PGM` must be the first statement; `ENDPGM` must be the last
- All declares (`DCL`, `DCLF`, `DCLPRCOPT`) must come before any executable commands
- Program-level `MONMSG` must follow declares but precede all other commands
- Program-level `MONMSG` EXEC is restricted to `GOTO` only
- Subroutines (`SUBR`/`ENDSUBR`) must be at the end of the source
- Maximum 255 parameters on `PGM`

---

## Variable declarations

```cl
DCL VAR(&NAME)    TYPE(*CHAR) LEN(50)  VALUE('DEFAULT')
DCL VAR(&COUNT)   TYPE(*DEC)  LEN(7 0) VALUE(0)
DCL VAR(&FOUND)   TYPE(*LGL)           VALUE('0')
DCL VAR(&IDX)     TYPE(*INT)  LEN(4)   VALUE(1)
DCL VAR(&FLAGS)   TYPE(*UINT) LEN(4)
DCL VAR(&PTR1)    TYPE(*PTR)
```

| Type | Default Len | Max Len | Notes |
|------|-------------|---------|-------|
| `*CHAR` | 32 | 32,767 | Most common type |
| `*DEC` | 15 5 | 15 digits, 9 dec | Packed decimal — LEN(total decimal) |
| `*LGL` | 1 | 1 | Values: '1' (true) or '0' (false) |
| `*INT` | 4 | 2, 4, or 8 bytes | Signed integer |
| `*UINT` | 4 | 2, 4, or 8 bytes | Unsigned integer |
| `*PTR` | — | — | Pointer (ILE only) |

### Overlay (DEFVAR)

```cl
DCL VAR(&FULL)  TYPE(*CHAR) LEN(20)
DCL VAR(&PART)  TYPE(*CHAR) STG(*DEFINED) DEFVAR(&FULL 5) LEN(10)
```

---

## Control flow

### IF / ELSE

```cl
IF COND(&STATUS *EQ 'ACTIVE') THEN(DO)
  /* commands */
ENDDO
ELSE CMD(DO)
  /* alternative */
ENDDO
```

- Max 10 nested IF/ELSE levels
- Use `DO`/`ENDDO` groups when THEN or ELSE needs multiple commands

### SELECT / WHEN / OTHERWISE

```cl
SELECT
  WHEN COND(&TYPE *EQ 'A') THEN(CALL PGM(PGMA))
  WHEN COND(&TYPE *EQ 'B') THEN(DO)
    /* commands */
  ENDDO
  OTHERWISE CMD(DO)
    /* default */
  ENDDO
ENDSELECT
```

- Max 25 nested levels
- Only the first true WHEN executes
- OTHERWISE is optional

### DOWHILE (test before — zero or more iterations)

```cl
DOWHILE COND(&EOF *NE '1')
  RCVF
  MONMSG MSGID(CPF0864) EXEC(CHGVAR &EOF '1')
  /* process record */
ENDDO
```

### DOUNTIL (test after — always executes at least once)

```cl
DOUNTIL COND(&REPLY *EQ 'Y')
  SNDUSRMSG MSG('Continue? (Y/N)') MSGTYPE(*INQ) MSGRPY(&REPLY)
ENDDO
```

### DOFOR (counted loop)

```cl
DCL VAR(&I) TYPE(*INT) LEN(4)
DOFOR VAR(&I) FROM(1) TO(10) BY(1)
  /* commands */
ENDDO
```

- Loop variable must be `*INT` or `*UINT`
- BY can be negative for countdown

### ITERATE and LEAVE

```cl
LOOP: DOWHILE ('1')
  IF (&DONE *EQ '1') THEN(LEAVE CMDLBL(LOOP))
  IF (&SKIP *EQ '1') THEN(ITERATE)
  /* processing */
ENDDO
```

### GOTO

```cl
GOTO CMDLBL(DONE)
...
DONE: ENDPGM
```

- Cannot branch into or out of a subroutine

---

## Expressions and built-in functions

### Operators

| Type | Keyword | Symbol |
|------|---------|--------|
| Equal | `*EQ` | `=` |
| Not equal | `*NE` | `^=` |
| Greater than | `*GT` | `>` |
| Less than | `*LT` | `<` |
| Greater/equal | `*GE` | `>=` |
| Less/equal | `*LE` | `<=` |
| And | `*AND` | `&` |
| Or | `*OR` | `\|` |
| Not | `*NOT` | `^` |

### Concatenation

| Operator | Behavior |
|----------|----------|
| `*CAT` | Concatenate as-is (preserve blanks) |
| `*BCAT` | Trim trailing blanks from first, insert one blank, then concatenate |
| `*TCAT` | Trim trailing blanks from first, then concatenate (no blank) |

```cl
CHGVAR &FULLNAME (%TRIM(&FIRST) *BCAT %TRIM(&LAST))
CHGVAR &EMAIL    (%TRIM(&USER) *TCAT '@' *TCAT %TRIM(&DOMAIN))
```

### Built-in functions

| Function | Purpose |
|----------|---------|
| `%TRIM(&var)` | Trim leading + trailing blanks |
| `%TRIML(&var)` | Trim leading blanks only |
| `%TRIMR(&var)` | Trim trailing blanks only |
| `%SST(&var start len)` | Substring — can be used as target of CHGVAR |
| `%BIN(&var start len)` | Binary integer conversion (2 or 4 bytes) |
| `%SWITCH(xxxxxxxx)` | Test 8 job switches (1=on, 0=off, X=ignore) |
| `%SCAN(search source)` | Find position of search string (0 = not found) |
| `%CHECK(comparator base)` | First char NOT in comparator |
| `%CHECKR(comparator base)` | %CHECK from right |
| `%LEN(&var)` | Declared length of variable |
| `%PARMS()` | Number of parameters passed |
| `%CHAR(&var)` | Convert numeric/logical to character |
| `%DEC(value digits dec)` | Convert to packed decimal |
| `%INT(value)` | Convert to signed integer |
| `%UINT(value)` | Convert to unsigned integer |
| `%LOWER(&var)` | Convert to lowercase |
| `%UPPER(&var)` | Convert to uppercase |
| `%SIZE(&var)` | Size in bytes |

---

## File handling

### DCLF (Declare File)

```cl
DCLF FILE(library/filename) RCDFMT(*ALL) OPNID(identifier)
```

- Max 5 DCLF per program/procedure
- Automatically declares variables for all fields and indicators in the file
- File must exist at compile time
- `OPNID` creates prefixed variables: `OPNID(CUST)` + field `NAME` = `&CUST_NAME`

### Display file I/O

```cl
SNDRCVF RCDFMT(FMT1)              /* write screen, wait for input */
SNDF    RCDFMT(FMT1)              /* write only (no wait) */
RCVF    RCDFMT(FMT1)              /* read only */
```

### Database file reading

```cl
/* Read loop pattern */
DOUNTIL (&EOF)
  RCVF
  MONMSG MSGID(CPF0864) EXEC(DO)
    CHGVAR &EOF '1'
    ITERATE
  ENDDO
  /* process record */
ENDDO
```

### Override and query pattern

```cl
OVRDBF FILE(MYFILE) TOFILE(MYLIB/MYFILE) SHARE(*YES)
OPNQRYF FILE((MYFILE)) QRYSLT('STATUS *EQ "A"') KEYFLD((NAME))
CALL PGM(MYRPGPGM)
CLOF OPNID(MYFILE)
DLTOVR FILE(MYFILE)
```

### Printer override pattern

```cl
OVRPRTF FILE(QPRINT) OUTQ(MYOUTQ) HOLD(*YES) COPIES(1) SAVE(*YES)
CALL PGM(MYRPTPGM)
DLTOVR FILE(QPRINT)
```

---

## Error handling (MONMSG)

### Program-level (global)

```cl
PGM
  DCL &ERRMSG TYPE(*CHAR) LEN(256)
  MONMSG MSGID(CPF0000) EXEC(GOTO CMDLBL(ERROR))

  /* ... program body ... */

  GOTO CMDLBL(END)

 ERROR:
  RCVMSG MSGTYPE(*EXCP) MSG(&ERRMSG) MSGID(&ERRID)
  SNDPGMMSG MSG(&ERRMSG) MSGTYPE(*ESCAPE)

 END: ENDPGM
```

### Command-level

```cl
/* Ignore "object not found" */
DLTF FILE(QTEMP/TEMPFILE)
MONMSG MSGID(CPF2105)

/* Handle end-of-file */
RCVF
MONMSG MSGID(CPF0864) EXEC(CHGVAR &EOF '1')

/* With DO group */
CHKOBJ OBJ(MYLIB/MYOBJ) OBJTYPE(*FILE)
MONMSG MSGID(CPF9801) EXEC(DO)
  CHGVAR &EXISTS '0'
ENDDO

/* Ignore all errors from a command */
CPYF FROMFILE(SRCFILE) TOFILE(TGTFILE) MBROPT(*ADD)
MONMSG MSGID(CPF0000)
```

### Common message IDs

| ID | Meaning |
|----|---------|
| `CPF0000` | All CPF messages (generic catch-all) |
| `CPF0001` | Error found on command |
| `CPF0864` | End of file (no more records) |
| `CPF2103` | Library already in library list |
| `CPF2105` | Object not found |
| `CPF2110` | Library not found in library list |
| `CPF2817` | Copy command — no records copied |
| `CPF2868` | Copy command — member not found |
| `CPF5813` | File already exists |
| `CPF7302` | File already exists (source PF) |
| `CPF9801` | Object not found |
| `CPF9897` | RPGUnit test message |
| `CPF9898` | General purpose message in QCPFMSG |
| `CPF9999` | Function check |
| `MCH0000` | All machine check messages |

### Scoping rules

- **Command-level MONMSG**: placed immediately after the command — handles errors from that command only; EXEC can be any command including DO groups
- **Program-level MONMSG**: placed after declares, before body — acts as global fallback; EXEC restricted to GOTO only
- Command-level overrides program-level for the same message ID
- Monitors only **escape, notify, and status** messages (not completion or diagnostic)

---

## Data area operations

```cl
/* Clear local data area */
CHGDTAARA DTAARA(*LDA (1 512)) VALUE(' ')

/* Write values to LDA at specific positions */
CHGDTAARA DTAARA(*LDA (1 4))  VALUE(&YEAR)
CHGDTAARA DTAARA(*LDA (5 2))  VALUE(&MONTH)
CHGDTAARA DTAARA(*LDA (7 50)) VALUE(&EMAIL)

/* Read from LDA */
RTVDTAARA DTAARA(*LDA (1 4)) RTNVAR(&YEAR)

/* Named data area */
CHGDTAARA DTAARA(MYLIB/MYDTAARA) VALUE(&NEWVAL)
RTVDTAARA DTAARA(MYLIB/MYDTAARA) RTNVAR(&CURVAL)
```

| Data Area | Size | Scope |
|-----------|------|-------|
| `*LDA` | 1,024 bytes | Local to the job |
| `*GDA` | 512 bytes | Group jobs only |
| `*PDA` | 2,000 bytes | Prestart jobs only |

---

## Job and system commands

### SBMJOB (Submit Job)

```cl
SBMJOB CMD(CALL PGM(MYPGM) PARM(&P1 &P2)) +
       JOB(MYJOBNAME) +
       JOBQ(QS36EVOKE) +
       USER(BATCHUSR) +
       INLLIBL(*JOBD)
```

### RTVJOBA (Retrieve Job Attributes)

```cl
DCL VAR(&USER)  TYPE(*CHAR) LEN(10)
DCL VAR(&OUTQ)  TYPE(*CHAR) LEN(10)
RTVJOBA USER(&USER) OUTQ(&OUTQ)
```

### Library list management

```cl
ADDLIBLE LIB(MYLIB)
MONMSG MSGID(CPF2103)                       /* already in list */

ADDLIBLE LIB(QALIB) POSITION(*AFTER MYLIB)
MONMSG MSGID(CPF0000)

RMVLIBLE LIB(OLDLIB)
MONMSG MSGID(CPF2110)                       /* not in list */
```

### CHGJOB

```cl
CHGJOB OUTQ(MYLIB/MYOUTQ)
CHGJOB SWS(10XXXXXX)        /* set switch 1=on, 2=off, rest unchanged */
```

### RUNSQL (run SQL from CL)

```cl
RUNSQL SQL('UPDATE CONFIGTBL SET CFGVAL = ''Y'' +
           WHERE CFGAPP = ''MYAPP'' AND +
           CFGKEY = ''MYKEY''') +
       COMMIT(*NONE)
```

Note: single quotes in SQL strings must be doubled (`''`) within CL string literals.

---

## ILE CL specifics

### DCLPRCOPT (processing options)

```cl
DCLPRCOPT DFTACTGRP(*NO) BNDDIR(UTILBD)
DCLPRCOPT DFTACTGRP(*NO) ACTGRP(*CALLER) BNDDIR(UTILBD)
DCLPRCOPT DFTACTGRP(*NO) BNDDIR(UTILBD MYUTILS)
```

- `DFTACTGRP(*NO)` required when using `BNDDIR` or `CALLPRC`
- `BNDDIR`: up to 300 binding directories

### CALLPRC (call bound procedure)

```cl
CALLPRC PRC(GETCFGVAL) +
        PARM((&APP *BYREF) (&KEY *BYREF) (&DFT *BYREF)) +
        RTNVAL(&RESULT)

CALLPRC PRC(VERIFYEMAIL) PARM(&EMAIL &DOLSCHK) RTNVAL(&ERRMSG)

CALLPRC PRC(ISMONTHEND) RTNVAL(&ISMNTHEND)
```

- Procedure name is case-sensitive, up to 256 bytes
- `*BYREF` (default): pass by reference — changes propagate back
- `*BYVAL`: pass by value — changes do not affect caller

### Subroutines

```cl
/* Define subroutine (must be at end of source) */
SUBR SUBR(CLEANUP)
  DLTF FILE(QTEMP/WORKFILE)
  MONMSG MSGID(CPF2105)
  RTNSUBR RTNVAL(0)
ENDSUBR

/* Call subroutine */
DCL VAR(&RC) TYPE(*INT) LEN(4)
CALLSUBR SUBR(CLEANUP) RTNVAL(&RC)
```

- Cannot nest subroutine definitions
- GOTO cannot branch into or out of a subroutine
- Default RTNSUBR value is 0

---

## Compilation

| Style | Command | Result |
|-------|---------|--------|
| OPM | `CRTCLPGM PGM(lib/pgm) SRCFILE(lib/QCLSRC)` | `*PGM` (OPM) |
| ILE single-module | `CRTBNDCL PGM(lib/pgm) SRCFILE(lib/QCLLESRC) DFTACTGRP(*NO)` | `*PGM` (ILE) |
| ILE module | `CRTCLMOD MODULE(lib/mod) SRCFILE(lib/QCLLESRC)` | `*MODULE` |
| ILE bind | `CRTPGM PGM(lib/pgm) MODULE(mod1 mod2) BNDDIR(UTILBD)` | `*PGM` (ILE) |

### CRTBNDCL (preferred for new code)

```
CRTBNDCL PGM(DEVLIB/MYPGM) SRCFILE(DEVLIB/QCLLESRC) SRCMBR(MYPGM) +
         DFTACTGRP(*NO) ACTGRP(*CALLER) DBGVIEW(*SOURCE) +
         REPLACE(*YES)
```

---

## Common program patterns

### Interactive screen program pattern

```cl
             PGM        /* Description of program */

             DCLPRCOPT  DFTACTGRP(*NO) BNDDIR(UTILBD)
             DCLF       FILE(MYDSPF)

             CHGDTAARA  DTAARA(*LDA (1 512)) VALUE(' ')

 START:      SNDRCVF    RCDFMT(FMT1)
             IF         COND(&IN03) THEN(GOTO END)

             /* Validate input */
             IF         COND(&FIELD1 *EQ ' ') THEN(DO)
                CHGVAR  VAR(&ERRMSG) VALUE('Field cannot be blank')
                GOTO    CMDLBL(START)
             ENDDO

             /* Pass data via LDA and submit */
             CHGDTAARA  DTAARA(*LDA (1 10)) VALUE(&FIELD1)
             SBMJOB     CMD(CALL PGM(MYBATCHPGM)) JOB(MYBATCH)

 END:        ENDPGM
```

### Menu program pattern

```cl
             PGM        /* DEPARTMENT MENU */
             DCLF       FILE(MYMENUD)
             DCL        VAR(&RTNCD) TYPE(*CHAR) LEN(1)
             MONMSG     MSGID(CPF0000) EXEC(GOTO CMDLBL(ABEND))

             RMVMSG     CLEAR(*ALL)

 START:      SNDRCVF    RCDFMT(MENUFMT)
             RMVMSG     CLEAR(*ALL)

             IF         COND(&IN03) THEN(RETURN)

             IF         COND(&OPTION = 01) THEN(DO)
                CALL    PGM(INQUIRY01)
                GOTO    CMDLBL(START)
             ENDDO

             IF         COND(&OPTION = 02) THEN(DO)
                CALL    PGM(REPORT02C)
                GOTO    CMDLBL(START)
             ENDDO

             IF         COND(&OPTION = 90) THEN(SIGNOFF)

             GOTO       CMDLBL(START)

 ABEND:      SIGNOFF    LOG(*LIST)
             ENDPGM
```

### Batch orchestration pattern

```cl
             PGM        /* NIGHTLY BATCH PROCESSING */
             DCLPRCOPT  DFTACTGRP(*NO) BNDDIR(UTILBD)

             /* Step 1: Backup */
             CPYF       FROMFILE(*LIBL/MYFILE) +
                          TOFILE(*LIBL/MYFILEBK) MBROPT(*ADD) +
                          FMTOPT(*MAP)
             MONMSG     MSGID(CPF0000)

             /* Step 2: Run report */
             OVRPRTF    FILE(QPRINT) OUTQ(DLYOUTQ) COPIES(1) SAVE(*YES)
             CALL       PGM(RPTPGM01)
             DLTOVR     FILE(QPRINT)

             /* Step 3: Update masters */
             CALL       PGM(UPDPGM01)

             /* Step 4: Cleanup */
             CLRPFM     FILE(WORKFILE)

             ENDPGM
```

### Unit test environment setup pattern

```cl
             PGM        PARM(&TEST)
             DCL        VAR(&TEST) TYPE(*CHAR) LEN(32)
             DCL        VAR(&OBJLIB) TYPE(*CHAR) LEN(10) VALUE('MYTESTLIB')

             /* Create test library */
             CRTLIB     LIB(&OBJLIB) TYPE(*TEST) TEXT('Unit Testing')
             MONMSG     CPF0000

             /* Setup library list */
             ADDLIBLE   LIB(&OBJLIB)
             MONMSG     MSGID(CPF2103)
             ADDLIBLE   LIB(RPGUNIT) POSITION(*LAST)
             MONMSG     MSGID(CPF2103)

             /* Copy source */
             CRTSRCPF   FILE(&OBJLIB/QRPGLESRC) RCDLEN(112)
             MONMSG     MSGID(CPF5813 CPF7302)

             CPYSRCF    FROMFILE(PRODLIB/QRPGLESRC) +
                          TOFILE(&OBJLIB/QRPGLESRC) +
                          FROMMBR(MYMOD*) MBROPT(*REPLACE)
             MONMSG     MSGID(CPF2868 CPF2817)

             /* Build objects */
             CRTSQLRPGI OBJ(&OBJLIB/MYMOD) +
                          SRCFILE(&OBJLIB/QRPGLESRC) +
                          OBJTYPE(*MODULE) REPLACE(*YES)

             CRTSRVPGM  SRVPGM(&OBJLIB/MYMOD) +
                          SRCFILE(&OBJLIB/QRPGLESRC) +
                          SRCMBR(MYMOD_B)

             /* Run tests */
             RPGUNIT/RUCALLTST TSTPGM(&OBJLIB/MYMOD_T) DETAIL(*ALL)
             MONMSG     MSGID(CPF9897)

             ENDPGM
```

### Worker thread spawning pattern

```cl
             PGM        PARM(&OP &WORKER &MAXTHDS)
             DCL        VAR(&OP)      TYPE(*CHAR) LEN(5)
             DCL        VAR(&WORKER)  TYPE(*CHAR) LEN(10)
             DCL        VAR(&MAXTHDS) TYPE(*CHAR) LEN(2)
             DCL        VAR(&THDS)    TYPE(*INT)  LEN(2)
             DCL        VAR(&I)       TYPE(*INT)  LEN(2)
             DCL        VAR(&JOBNAME) TYPE(*CHAR) LEN(10)

             CHGVAR     VAR(&THDS) VALUE(&MAXTHDS)

             IF COND(&OP *EQ 'START') THEN(DO)
                DOFOR VAR(&I) FROM(1) TO(&THDS)
                   CHGVAR VAR(&JOBNAME) VALUE(%TRIM(&WORKER) *TCAT %CHAR(&I))
                   SBMJOB CMD(CALL PGM(&WORKER) PARM(%CHAR(&I))) +
                          JOB(&JOBNAME) JOBQ(QS36EVOKE) +
                          USER(BATCHUSR) INLLIBL(*JOBD)
                ENDDO
             ENDDO

             ENDPGM
```

---

## CL limitations

CL programs **cannot**:
- Add or update database file records directly (use RPG or SQL for DML)
- Use printer or ICF files directly
- Use subfiles within display files (the display file is defined in DDS; CL just sends/receives)
- Use program-described display files

---

## Review checklist

When **generating** CL:

1. Start with `PGM` and end with `ENDPGM`
2. Place all declares before any executable commands
3. Include `DCLPRCOPT DFTACTGRP(*NO) BNDDIR(UTILBD)` when using `CALLPRC`
4. Include a global `MONMSG MSGID(CPF0000)` as a safety net
5. Monitor for `CPF0864` in any database read loop
6. Pair every `OVRPRTF`/`OVRDBF` with a corresponding `DLTOVR`
7. Clear `*LDA` before writing to it: `CHGDTAARA DTAARA(*LDA (1 512)) VALUE(' ')`
8. Use `MONMSG` after `ADDLIBLE` for `CPF2103` (already exists)
9. Use `MONMSG` after `DLTF`/`DLTOBJ` for `CPF2105` (not found)
10. Keep all object names <= 10 characters
11. Never store raw SSN or other PII — always route it through your shop's encryption function or program

When **reviewing** CL:

- Missing `MONMSG` after commands that can fail (DLTF, CHKOBJ, ADDLIBLE, RCVF)
- Missing `DLTOVR` after `OVRPRTF`/`OVRDBF` (resource leak)
- `GOTO` branching into or out of subroutines (undefined behavior)
- Using `DO` groups in program-level `MONMSG` EXEC (only `GOTO` allowed)
- Uninitialized `*LDA` — data from previous job step may persist
- `SBMJOB` without specifying `USER` or `INLLIBL` when needed for batch
- Variables used before being set (especially display file fields before first `SNDRCVF`)
- Mixed case inconsistency (CL is case-insensitive, but conventions matter for readability)
- PII fields (SSN, bank account) handled without encryption

---

## Common mistakes to avoid

- Forgetting `MONMSG` after `RCVF` in a read loop — `CPF0864` is not optional
- Using `DO` in program-level `MONMSG` EXEC — only `GOTO` is allowed there
- Branching with `GOTO` into/out of subroutines — causes undefined behavior
- Forgetting to double single quotes in RUNSQL: use `''Y''` not `'Y'`
- Setting `DFTACTGRP(*YES)` when using `BNDDIR` or `CALLPRC` — requires `*NO`
- Not clearing `*LDA` before writing to it — stale data from previous programs
- Missing `DLTOVR` after `OVRPRTF`/`OVRDBF` — override persists beyond intended scope
- Using `*LDA` positions that overlap with values from a calling program
- Forgetting `FMTOPT(*MAP)` on `CPYF` when source and target formats differ
