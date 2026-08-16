package com.scorealert.app.net

import com.scorealert.app.BuildConfig
import com.scorealert.app.model.HealthResponse
import com.scorealert.app.model.Listing
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * Backend API. The phone talks ONLY to the ScoreAlert backend — never directly to any
 * marketplace. Secrets stay server-side; the app holds none.
 */
interface ScoreAlertApi {

    @GET("listings/{id}")
    suspend fun getListing(@Path("id") id: String): Listing

    @GET("admin/health")
    suspend fun getHealth(): HealthResponse

    /** Android Share Sheet -> backend ingestion. */
    @POST("ingest/share")
    suspend fun ingestShare(@Body payload: Map<String, String?>): Map<String, Any?>

    @POST("devices")
    suspend fun registerDevice(@Body payload: Map<String, String?>): Map<String, Any?>

    companion object {
        fun create(): ScoreAlertApi {
            val logging = HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC }
            val client = OkHttpClient.Builder().addInterceptor(logging).build()
            val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
            return Retrofit.Builder()
                .baseUrl(BuildConfig.API_BASE_URL)
                .client(client)
                .addConverterFactory(MoshiConverterFactory.create(moshi))
                .build()
                .create(ScoreAlertApi::class.java)
        }
    }
}
