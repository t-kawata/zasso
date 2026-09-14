#include "widget.h"

#include <stdio.h>

/* Compiled only when the build defines WIDGET_FAST, so this translation unit
   carries a declaration the default build does not and the preprocessor decides
   which code exists before the compiler sees it. */
#if defined(WIDGET_FAST)
#define LABEL_SEPARATOR ':'
#else
#define LABEL_SEPARATOR '-'
#endif

const char *widget_label(Widget *widget) {
  snprintf(widget->label, sizeof(widget->label), "widget%c%s", LABEL_SEPARATOR, widget->identity);
  return widget->label;
}
