package com.scorealert.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// ScoreAlert palette — "modern radar / deal scanner", dark-first.
private val Radar = Color(0xFF00E5A8)       // signal green (primary)
private val ScoreHot = Color(0xFFFF3B30)    // 🔥 score-now red
private val ScoreWarm = Color(0xFFFFB020)   // great-find amber
private val Ink = Color(0xFF0A0E12)          // near-black background
private val Surface = Color(0xFF141A21)
private val SurfaceHi = Color(0xFF1D2731)
private val TextHi = Color(0xFFF2F5F7)
private val TextLo = Color(0xFF8A97A6)

private val DarkColors = darkColorScheme(
    primary = Radar,
    onPrimary = Ink,
    secondary = ScoreWarm,
    error = ScoreHot,
    background = Ink,
    onBackground = TextHi,
    surface = Surface,
    onSurface = TextHi,
    surfaceVariant = SurfaceHi,
    onSurfaceVariant = TextLo,
)

private val LightColors = lightColorScheme(
    primary = Color(0xFF00A37A),
    onPrimary = Color.White,
    secondary = Color(0xFFB4780A),
    error = ScoreHot,
    background = Color(0xFFF6F8FA),
    onBackground = Color(0xFF0A0E12),
    surface = Color.White,
    onSurface = Color(0xFF0A0E12),
    surfaceVariant = Color(0xFFE7ECF1),
    onSurfaceVariant = Color(0xFF5A6674),
)

val ScoreAlertShapes = Shapes(
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(24.dp),
)

// Big prices, strong typography — understand a listing in two seconds.
val ScoreAlertType = Typography(
    headlineLarge = Typography().headlineLarge.copy(fontWeight = FontWeight.Black, fontSize = 34.sp),
    titleLarge = Typography().titleLarge.copy(fontWeight = FontWeight.Bold),
    titleMedium = Typography().titleMedium.copy(fontWeight = FontWeight.SemiBold),
    labelLarge = Typography().labelLarge.copy(fontWeight = FontWeight.Bold),
)

/** Score → accent color for badges. */
@Composable
fun scoreColor(label: String): Color = when (label) {
    "SCORE_NOW" -> MaterialTheme.colorScheme.error
    "GREAT_FIND" -> MaterialTheme.colorScheme.secondary
    else -> MaterialTheme.colorScheme.primary
}

@Composable
fun ScoreAlertTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = ScoreAlertType,
        shapes = ScoreAlertShapes,
        content = content
    )
}
