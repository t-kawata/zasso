#ifndef WIDGET_H
#define WIDGET_H

#include <stddef.h>

/* A function-like macro. Its arguments are substituted into the expansion, so
   what a call becomes is not decided where the call is written and a reader that
   treats the name as a function has the wrong model of it. */
#define MAX_OF(left, right) ((left) > (right) ? (left) : (right))

/* The type both translation units share, so the header is the one place its
   layout is written. */
typedef struct Widget {
  char identity[32];
  char label[64];
} Widget;

const char *widget_label(Widget *widget);
size_t widget_identity_length(const Widget *widget);

#endif
