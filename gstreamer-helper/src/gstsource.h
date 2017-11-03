/*
 * <one line to give the library's name and an idea of what it does.>
 * Copyright 2015  <copyright holder> <email>
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation; either version 2 of
 * the License or (at your option) version 3 or any later version
 * accepted by the membership of KDE e.V. (or its successor approved
 * by the membership of KDE e.V.), which shall act as a proxy
 * defined in Section 14 of version 3 of the license.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

#ifndef GSTSOURCE_H
#define GSTSOURCE_H

#include <QCoreApplication>
#include <QSocketNotifier>

#include <gst/gst.h>

#include "reader.h"

static const char* GST_PIPELINE_DESCRIPTION = "rtpbin name=rtpbin latency=50 pulsesrc device=ubidoo_rtp_sink.monitor ! queue ! audioconvert ! audioresample ! faac quality=150 ! capsfilter caps=\"audio/mpeg,mpegversion=4,channels=2\" ! rtpmp4apay! rtpbin.send_rtp_sink_0 rtpbin.send_rtp_src_0 ! udpsink name=rtpsink host=%1 auto-multicast=true port=%2 rtpbin.send_rtcp_src_0 ! udpsink name=rtcpsink host=%1 port=%3 sync=false async=false";
static const char* GST_RECEIVE_PIPELINE_DESCRIPTION = "rtpbin name=rtpbin latency=50 udpsrc name=udpsrc address=%1 port=%2 ! rtpbin.recv_rtp_sink_0 rtpbin. ! rtpmp4adepay ! faad ! audioconvert ! audioresample ! pulsesink client-name=ubidoo_rtp_playback udpsrc address=%1 port=%3 ! rtpbin.recv_rtcp_sink_0";

class GstSource : public QCoreApplication
{
    Q_OBJECT

public:
    GstSource(int argc, char** argv);
    ~GstSource();

public slots:
    void startStream(QString host, QString rtpPort, QString rtcpPort, QString parameters);
    void shutdown();
    
private:
    GstElement *pipeline;
    Reader reader;
    
    bool server;
    int gstBusWatchId;
    
    static gboolean gstBusCallback(GstBus *bus, GstMessage *message, void* data);
    void closePipeline();
};

#endif // GSTSOURCE_H
