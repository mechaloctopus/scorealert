package com.scorealert.app.fcm

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.scorealert.app.MainActivity
import com.scorealert.app.R
import com.scorealert.app.net.ScoreAlertApi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Receives FCM messages from the ScoreAlert backend and posts a notification whose tap
 * opens the listing detail via the scorealert://listing/{id} deep link. Payload shape
 * matches backend/src/alerts/fcm.ts (notification + data{listingId,score,deeplink,...}).
 */
class ScoreAlertMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        // Register this device with the backend so it can target pushes at this user.
        CoroutineScope(Dispatchers.IO).launch {
            runCatching { ScoreAlertApi.create().registerDevice(mapOf("token" to token, "platform" to "android")) }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        val notif = message.notification
        val title = notif?.title ?: data["title"] ?: "ScoreAlert"
        val body = notif?.body ?: data["body"].orEmpty()
        val channel = data["category"]?.let(::channelFor) ?: "vehicle"
        val deeplink = data["deeplink"] ?: ("scorealert://listing/" + (data["listingId"] ?: ""))

        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(deeplink), this, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val pending = PendingIntent.getActivity(
            this, deeplink.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(this, channel)
            .setSmallIcon(R.drawable.ic_stat_scorealert)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pending)
            .setPriority(NotificationCompat.PRIORITY_HIGH)

        val nm = getSystemService(NotificationManager::class.java)
        nm.notify((data["listingId"] ?: title).hashCode(), builder.build())
    }

    private fun channelFor(category: String): String = when (category) {
        "free" -> "free"
        "motorcycle" -> "motorcycle"
        "boat" -> "boat"
        else -> "vehicle"
    }
}
