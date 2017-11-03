#include "pahelper.h"
#include <QDebug>

#include <stdio.h>
#include <stdlib.h>
#include <signal.h>

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

static PAHelper* instance = NULL;

void signal_callback_handler(int signum)
{
    if (instance) {
        instance->shutdown();
    }
}

int main(int argc, char** argv) {
    // register signal traps
    // this is so we can clean up and remove the pulseaudio sink we created
    // before terminating the program
    signal(SIGINT, signal_callback_handler);
    signal(SIGTERM, signal_callback_handler);
    
    // register message handler to redirect all output to stderr
    qInstallMessageHandler(myMessageOutput);
    
    // initialize main application
    PAHelper app(argc, argv);
    instance = &app;
    
    qDebug() << "Starting main loop...";
    
    return app.exec();
}