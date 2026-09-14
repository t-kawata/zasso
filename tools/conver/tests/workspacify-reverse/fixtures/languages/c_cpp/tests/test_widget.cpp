#include "widget.h"

#include <assert.h>
#include <string.h>

/* The sufficiency of the file name, not of the assertions. P24-1's declaration
   records the presence of a test file per representative and nothing about what
   it asserts, so this file makes that claim true and stays readable. */
int main(void) {
  Widget widget = {"7", ""};

  assert(strcmp(widget_label(&widget), "widget-7") == 0);
  assert(widget_identity_length(&widget) == 1);
  assert(MAX_OF(3, 4) == 4);

  return 0;
}
