package com.scorealert.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.media.AudioAttributes
import android.net.Uri

/**
 * Application entry point. Registers the notification channels the backend routes to
 * (see backend/src/alerts/fcm.ts channelForCategory). Channel = category; urgency comes
 * from HIGH priority + a distinct sound on the score_now channel.
 */
class ScoreAlertApp : Application() {

    override fun onCreate() {
        super.onCreate()
        createChannels()
    }

    private fun createChannels() {
        val nm = getSystemService(NotificationManager::class.java)

        // High-importance urgent channel (heads-up + custom sound) for 🔥 SCORE NOW.
        val urgentSound = Uri.parse("android.resource://$packageName/raw/score_now")
        val urgentAttrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

        val channels = listOf(
            channel("score_now", "🔥 Score Now", NotificationManager.IMPORTANCE_HIGH)
                .apply { setSound(urgentSound, urgentAttrs) },
            channel("vehicle", "🚗 Vehicles", NotificationManager.IMPORTANCE_HIGH),
            channel("motorcycle", "🏍 Motorcycles", NotificationManager.IMPORTANCE_HIGH),
            channel("boat", "🚤 Boats", NotificationManager.IMPORTANCE_HIGH),
            channel("free", "🆓 Free", NotificationManager.IMPORTANCE_HIGH),
            channel("price_drop", "💰 Price Drops", NotificationManager.IMPORTANCE_DEFAULT),
        )
        nm.createNotificationChannels(channels)
    }

    private fun channel(id: String, name: String, importance: Int) =
        NotificationChannel(id, name, importance).apply {
            description = "ScoreAlert $name alerts"
            enableVibration(true)
        }
}
