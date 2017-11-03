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

#include "gstsource.h"

#include <QDebug>
#include <QThread>

#include <glib.h>

#include <iostream>
extern "C" {
#include <stdlib.h>
#include <stdio.h>
}

GstSource::GstSource(int argc, char** argv) : QCoreApplication(argc, argv)
{
    pipeline = NULL;
    gst_init(&argc, &argv);
    
    if (argc < 5 || (strcmp(argv[1], "-r") != 0 && strcmp(argv[1], "-s") != 0)) {
        std::cout << "Usage: " << argv[0] << " -s <multicast-group> <rtpPort> <rtcpPort>" << std::endl;
        std::cout << "Usage: " << argv[0] << " -r <multicast-group> <rtpPort> <rtcpPort> <streamParameters>" << std::endl;
        std::exit(1);
    }
    
    if (strcmp(argv[1], "-s") == 0) {
        server = true;
        startStream(argv[2], argv[3], argv[4], QString());
    } else {
        server = false;
        if (argc != 6) {
            std::cout << "Missing streamParameters argument." << std::endl;
            std::exit(1);
        }
        startStream(argv[2], argv[3], argv[4], argv[5]);
    }
    
    // monitor stdin and exit when stdin is closed
    QThread * readerThread = new QThread();
    reader.moveToThread(readerThread);
    connect(&reader, SIGNAL(finished()), this, SLOT(shutdown()));
    
    // reader thread startup and shutdown
    connect(readerThread, SIGNAL(started()), &reader, SLOT(read()));
    connect(&reader, SIGNAL(finished()), readerThread, SLOT(quit()));
    connect(readerThread, SIGNAL(finished()), readerThread, SLOT(deleteLater()));
    
    readerThread->start();
}

GstSource::~GstSource()
{
    
}

void GstSource::shutdown()
{
    closePipeline();
    exit(0);
}

void GstSource::closePipeline()
{
    if (pipeline) {
        gst_element_set_state(pipeline, GST_STATE_NULL);
        gst_object_unref(pipeline);
        g_source_remove(gstBusWatchId);
        pipeline = NULL;
    }
}


void GstSource::startStream(QString host, QString rtpPort, QString rtcpPort, QString parameters)
{
    QString pipelineDesc;
    if (server) {
        pipelineDesc = QString(GST_PIPELINE_DESCRIPTION).arg(host).arg(rtpPort).arg(rtcpPort);
    } else {
        pipelineDesc = QString(GST_RECEIVE_PIPELINE_DESCRIPTION).arg(host).arg(rtpPort).arg(rtcpPort);
    }
    GError *err = NULL;
    pipeline = gst_parse_launch(pipelineDesc.toLocal8Bit().constData(), &err);
    if (!pipeline) {
        if (err) {
            qWarning() << "There was a problem constructing the pipeline:" << err->message;
        } else {
            qWarning() << "There was a problem constructing the pipeline. The cause is unknown.";
        }
        std::exit(1);
    }
    
    // register message handler
    GstBus *bus = gst_pipeline_get_bus(GST_PIPELINE (pipeline));
    gstBusWatchId = gst_bus_add_watch(bus, GstSource::gstBusCallback, this);
    gst_object_unref(bus);
    
    if (!server) {
        // in client mode, the stream parameters must be set
        GstStructure *structure = gst_structure_from_string(parameters.toLocal8Bit().constData(), NULL);
        if (!structure) {
            qWarning() << "unable to parse stream parameters.";
            std::exit(1);
        }
        GstCaps *caps = gst_caps_new_full(structure, NULL);
        GstElement *udpsrc = gst_bin_get_by_name(GST_BIN (pipeline), "udpsrc");
        Q_ASSERT(udpsrc);
        GValue *val = (GValue*) calloc(1, sizeof(GValue));
        g_value_init(val, GST_TYPE_CAPS);
        gst_value_set_caps(val, caps);
        g_object_set_property(G_OBJECT(udpsrc), "caps", val);
        gst_object_unref(udpsrc);
        free(val);
    }
    
    gst_element_set_state(pipeline, GST_STATE_PLAYING);
    
    if (err) {
        g_error_free(err);
    }
}

gboolean GstSource::gstBusCallback(GstBus* bus, GstMessage* message, void* data)
{
    GstSource *that = (GstSource *) data;
    
    switch (GST_MESSAGE_TYPE (message)) {
        case GST_MESSAGE_ERROR: {
            GError *err;
            gchar *debug;

            char* senderName = gst_object_get_name(message->src);
            gst_message_parse_error (message, &err, &debug);
            qCritical() << "[" << senderName << "]" << err->message;
            g_error_free (err);
            g_free (debug);
            g_free(senderName);
            
            // shutdown the pipeline when encountering an error
            that->closePipeline();
            exit(2);
            break;
        }
        case GST_MESSAGE_WARNING: {
            GError *err;
            gchar *debug;
            
            // echo warnings to stderr
            char* senderName = gst_object_get_name(message->src);
            gst_message_parse_warning(message, &err, &debug);
            qWarning() << "[" << senderName << "]" << err->message;
            g_error_free (err);
            g_free (debug);
            g_free(senderName);
            break;
        }
        case GST_MESSAGE_EOS: {
            // exit program upon end of stream
            // we treat this as an error as this usually shouldn't happen
            exit(2);
            break;
        }
        case GST_MESSAGE_STATE_CHANGED: {
            // we are only interested in messages coming from our pipeline
            if (GST_MESSAGE_SRC(message) != (GstObject *) that->pipeline) {
                break;
            }
            GstState oldState, newState, pending;
            gst_message_parse_state_changed(message, &oldState, &newState, &pending);
            qDebug() << "Pipeline has changed state from" << gst_element_state_get_name(oldState) << "to" << gst_element_state_get_name(newState) << "(pending:" << gst_element_state_get_name(pending) << ")";
            
            // echo stream parameters to stdout as soon as pipeline is running
            if (that->server && newState == GST_STATE_PLAYING) {
                // query sink element caps of our udpsink
                GstElement *rtpsink = gst_bin_get_by_name(GST_BIN (that->pipeline), "rtpsink");
                Q_ASSERT(rtpsink);
                GstPad *pad = gst_element_get_static_pad(rtpsink, "sink");
                Q_ASSERT(pad);
                GstCaps *caps = gst_pad_get_current_caps(pad);
                
                // i hope this is always the case
                if (gst_caps_get_size(caps) > 0) {
                    GstStructure *gstStruct = gst_caps_get_structure(caps, 0);
                    gchar* str = gst_structure_to_string(gstStruct);
                    std::cout << "stream-meta ";
                    std::cout << str;
                    std::cout << std::endl << std::flush;
                    g_free(str);
                }
                
                gst_object_unref(pad);
                gst_object_unref(rtpsink);
            }
            
            break;
        }
        default:
            /* unhandled message */
        break;
    }
    
    return TRUE;
}

#include "gstsource.moc"
