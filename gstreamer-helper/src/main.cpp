#include "gstsource.h"
#include <QDebug>

#include <stdio.h>
#include <stdlib.h>
#include <signal.h>


#if QT_VERSION >= 0x050000
// redirect qDebug() and friends to stderr
void myMessageOutput(QtMsgType type, const QMessageLogContext &context, const QString &msg)
{
    QByteArray localMsg = msg.toLocal8Bit();
    switch (type) {
    case QtDebugMsg:
        fprintf(stderr, "Debug: %s\n", localMsg.constData());
        break;
#if QT_VERSION >= 0x050500
    case QtInfoMsg:
        fprintf(stderr, "Info: %s\n", localMsg.constData());
        break;
#endif
    case QtWarningMsg:
        fprintf(stderr, "Warning: %s\n", localMsg.constData());
        break;
    case QtCriticalMsg:
        fprintf(stderr, "Critical: %s\n", localMsg.constData());
        break;
    case QtFatalMsg:
        fprintf(stderr, "Fatal: %s\n", localMsg.constData());
        abort();
    }
}
#else
void myMessageOutput(QtMsgType type, const char *msg)
{
    switch (type) {
    case QtDebugMsg:
        fprintf(stderr, "Debug: %s\n", msg);
        break;
    case QtWarningMsg:
        fprintf(stderr, "Warning: %s\n", msg);
        break;
    case QtCriticalMsg:
        fprintf(stderr, "Critical: %s\n", msg);
        break;
    case QtFatalMsg:
        fprintf(stderr, "Fatal: %s\n", msg);
        abort();
    }
}
#endif

static GstSource* instance = NULL;

void signal_callback_handler(int signum)
{
    if (instance) {
        instance->shutdown();
    }
}

int main(int argc, char** argv) {
    // register signal traps
    // this is so we can clean up and shut down the pipeline
    // before terminating the program
    signal(SIGINT, signal_callback_handler);
    signal(SIGTERM, signal_callback_handler);
    
    // register message handler to redirect all output to stderr
#if QT_VERSION >= 0x050000
    qInstallMessageHandler(myMessageOutput);
#else
    qInstallMsgHandler(myMessageOutput);
#endif
    // initialize main application
    GstSource app(argc, argv);
    instance = &app;
    
    qDebug() << "Starting main loop...";
    
    return app.exec();
}