package com.scorealert.app.model

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/** Deal-score breakdown mirrored from the backend ScoreBreakdown. */
@JsonClass(generateAdapter = true)
data class Score(
    val overall: Int,
    val price: Int = 0,
    val freshness: Int = 0,
    val category: Int = 0,
    val keyword: Int = 0,
    val location: Int = 0,
    val condition: Int = 0,
    val label: String = "BELOW",
    val explanation: Explanation = Explanation()
) {
    val labelText: String
        get() = when (label) {
            "SCORE_NOW" -> "🔥 SCORE NOW"
            "GREAT_FIND" -> "⭐ GREAT FIND"
            "GOOD_LEAD" -> "GOOD LEAD"
            else -> ""
        }
}

@JsonClass(generateAdapter = true)
data class Explanation(
    val positives: List<String> = emptyList(),
    val watchouts: List<String> = emptyList()
)

@JsonClass(generateAdapter = true)
data class Facts(
    val category: String = "other",
    val make: String? = null,
    val model: String? = null,
    val year: Int? = null,
    val mileage: Int? = null,
    @Json(name = "runningStatus") val runningStatus: String = "unknown",
    @Json(name = "titleStatus") val titleStatus: String = "unknown",
    @Json(name = "registrationStatus") val registrationStatus: String = "unknown",
    val drivetrain: String = "unknown",
    val transmission: String = "unknown",
    val issues: List<String> = emptyList(),
    @Json(name = "isFree") val isFree: Boolean = false
)

/** A stored listing as returned by the backend. */
@JsonClass(generateAdapter = true)
data class Listing(
    val id: String,
    @Json(name = "sourceId") val sourceId: String,
    @Json(name = "canonicalUrl") val canonicalUrl: String,
    val title: String,
    val description: String = "",
    val price: Double? = null,
    val currency: String = "USD",
    val town: String? = null,
    @Json(name = "locationText") val locationText: String? = null,
    @Json(name = "primaryImageUrl") val primaryImageUrl: String? = null,
    @Json(name = "imageUrls") val imageUrls: List<String> = emptyList(),
    @Json(name = "firstSeenAt") val firstSeenAt: String? = null,
    @Json(name = "sourceCreatedAt") val sourceCreatedAt: String? = null,
    val facts: Facts = Facts(),
    val score: Score? = null
) {
    val priceText: String
        get() = if (facts.isFree || price == 0.0) "FREE"
        else price?.let { "$" + "%,d".format(it.toInt()) } ?: "—"

    val itemName: String
        get() = listOfNotNull(facts.year, facts.make, facts.model)
            .joinToString(" ").ifBlank { title }

    val locationLabel: String get() = town ?: locationText ?: "Kauaʻi"
}

/** SourcePolicy record for the admin / source-health screen. */
@JsonClass(generateAdapter = true)
data class SourceInfo(
    val id: String,
    val name: String,
    val policy: String,
    @Json(name = "autoCollect") val autoCollect: Boolean,
    val health: String,
    @Json(name = "howItWorks") val howItWorks: String
)

@JsonClass(generateAdapter = true)
data class HealthResponse(
    val sources: List<SourceInfo> = emptyList(),
    val generatedAt: String? = null
)
