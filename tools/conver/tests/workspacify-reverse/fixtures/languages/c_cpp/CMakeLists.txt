cmake_minimum_required(VERSION 3.16)
project(language-representative-c-cpp C CXX)

# Two translation units, one shared header. The header's declarations reach the
# program through both, which is what makes include resolution observable here.
add_library(widget STATIC src/widget.cpp src/widget_extra.cpp)
target_include_directories(widget PUBLIC src)

enable_testing()
add_executable(widget_test tests/test_widget.cpp)
target_link_libraries(widget_test PRIVATE widget)
add_test(NAME widget_test COMMAND widget_test)
