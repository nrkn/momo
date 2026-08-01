; keytest.asm - interactive smoke test
;
; Waits for a keypress via BIOS int 16h, echoes it via DOS int 21h, exits.
; Confirms interactive input works before the transpiler depends on it, and
; that two distinct int helpers coexist.

        cpu     8086
        org     100h

; ------------------------------------------------------------------ entry ----

; ---- _ah = 0x09; _dx = addr(prompt); int 0x21 ----
        mov     byte [_ah], 0x09
        mov     word [_dx], prompt
        call    int21

; ---- _ah = 0x00; int 0x16 ----
        mov     byte [_ah], 0x00        ; BIOS: wait for key, returns ascii in AL
        call    int16

; ---- _dl = _al; _ah = 0x02; int 0x21 ----
        mov     al, [_al]               ; _al still holds the key
        mov     [_dl], al
        mov     byte [_ah], 0x02        ; DOS: print char in DL
        call    int21

; ---- newline ----
        mov     byte [_dl], 13
        mov     byte [_ah], 0x02
        call    int21
        mov     byte [_dl], 10
        mov     byte [_ah], 0x02
        call    int21

; ---- _ax = 0x4C00; int 0x21 ----
        mov     word [_ax], 0x4C00
        call    int21

; ------------------------------------------------------------ int helpers ----

int21:
        mov     ax, [_ax]
        mov     bx, [_bx]
        mov     cx, [_cx]
        mov     dx, [_dx]
        mov     si, [_si]
        mov     di, [_di]
        int     0x21
        mov     [_ax], ax
        mov     [_bx], bx
        mov     [_cx], cx
        mov     [_dx], dx
        mov     [_si], si
        mov     [_di], di
        ret

int16:
        mov     ax, [_ax]
        mov     bx, [_bx]
        mov     cx, [_cx]
        mov     dx, [_dx]
        mov     si, [_si]
        mov     di, [_di]
        int     0x16
        mov     [_ax], ax
        mov     [_bx], bx
        mov     [_cx], cx
        mov     [_dx], dx
        mov     [_si], si
        mov     [_di], di
        ret

; ---------------------------------------------------------------- globals ----

_ax:    dw      0
_al     equ     _ax
_ah     equ     _ax + 1
_bx:    dw      0
_bl     equ     _bx
_bh     equ     _bx + 1
_cx:    dw      0
_cl     equ     _cx
_ch     equ     _cx + 1
_dx:    dw      0
_dl     equ     _dx
_dh     equ     _dx + 1
_si:    dw      0
_di:    dw      0

prompt: db      'Press any key: $'
