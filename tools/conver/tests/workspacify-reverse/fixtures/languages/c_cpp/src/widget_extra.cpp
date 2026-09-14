#include "widget.h"

#include <string.h>

/* The second translation unit to include the one header, so a reader has to
   follow the include twice to know what a Widget is. */
size_t widget_identity_length(const Widget *widget) {
  return strlen(widget->identity);
}
