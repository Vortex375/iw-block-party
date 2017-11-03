set(CMAKE_MODULE_PATH "${CMAKE_SOURCE_DIR}/cmake/modules")

cmake_minimum_required(VERSION 2.8.11)

project(pulseaudio-helper)

include(FindPkgConfig)

# Find includes in corresponding build directories
set(CMAKE_INCLUDE_CURRENT_DIR ON)
# Instruct CMake to run moc automatically when needed.
set(CMAKE_AUTOMOC ON)

find_package(PulseAudio REQUIRED)
find_package(Qt5Core REQUIRED)

pkg_check_modules(GLIB glib-2.0)
pkg_check_modules(PULSE_GLIB libpulse-mainloop-glib)

set(pahelper_SRCS
    src/reader.cpp
    src/pahelper.cpp
    src/main.cpp
)

include_directories(${Qt5Core_INCLUDE_DIRS} ${GLIB_INCLUDE_DIRS})

add_executable(iw-pa-helper ${pahelper_SRCS})

target_link_libraries(iw-pa-helper Qt5::Core ${PULSEAUDIO_LIBRARY} ${PULSE_GLIB_LIBRARIES})

install(TARGETS iw-pa-helper DESTINATION bin)
