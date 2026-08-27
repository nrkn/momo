; hello.asm - toolchain smoke test
;
; Hand-written in the style the transpiler is intended to emit.
; Exercises: org 100h tiny model, reserved-register globals, addr(), int sync.

        cpu     8086                    ; makes NASM enforce the strict-8086 subset
        org     100h

; ------------------------------------------------------------------ entry ----

; ---- _ah = 0x09 ----
        mov     byte [_ah], 0x09
; ---- _dx = addr(msg) ----
        mov     word [_dx], msg         ; a .COM label is a link-time constant
; ---- int 0x21 ----
        call    int21

; ---- _ax = 0x4C00 ----
        mov     word [_ax], 0x4C00      ; DOS terminate, exit code 0
; ---- int 0x21 ----
        call    int21

; ------------------------------------------------------------- int helper ----
; One helper per distinct INT number. The literal is baked into the helper, so
; the register sync is emitted once rather than at every call site.

int21:
        mov     ax, [_ax]
        mov     bx, [_bx]
        mov     cx, [_cx]
        mov     dx, [_dx]
        mov     si, [_si]
        mov     di, [_di]
        int     0x21
        mov     [_ax], ax               ; results come back the same way
        mov     [_bx], bx
        mov     [_cx], cx
        mov     [_dx], dx
        mov     [_si], si
        mov     [_di], di
        ret

; ---------------------------------------------------------------- globals ----
; The reserved globals are the machine registers. Byte aliases index into the
; word storage; little-endian puts the low byte first.

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

msg:    db      'Hello from the toolchain!', 13, 10, '$'
