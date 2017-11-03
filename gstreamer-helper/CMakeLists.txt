set(CMAKE_MODULE_PATH "${CMAKE_SOURCE_DIR}/cmake/modules")

cmake_minimum_required(VERSION 2.8.11)

project(gstreamer-helper)

include(FindPkgConfig)

# Find includes in corresponding build directories
set(CMAKE_INCLUDE_CURRENT_DIR ON)
# Instruct CMake to run moc automatically when needed.
set(CMAKE_AUTOMOC ON)

find_package(Qt5Core REQUIRED)

pkg_check_modules(GLIB REQUIRED glib-2.0)
pkg_check_modules(GOBJECT REQUIRED gobject-2.0)
pkg_check_modules(GSTREAMER REQUIRED gstreamer-1.0>=1.4)

set(gsthelper_SRCS
    src/reader.cpp
    src/gstsource.cpp
    src/main.cpp
)

include_directories(${Qt5Core_INCLUDE_DIRS} ${GLIB_INCLUDE_DIRS} ${GOBJECT_INCLUDE_DIRS} ${GSTREAMER_INCLUDE_DIRS})

add_executable(iw-gst-helper ${gsthelper_SRCS})

target_link_libraries(iw-gst-helper Qt5::Core ${GSTREAMER_LIBRARIES} ${GOBJECT_LIBRARIES} ${GLIB_LIBRARIES})

install(TARGETS iw-gst-helper DESTINATION bin)
