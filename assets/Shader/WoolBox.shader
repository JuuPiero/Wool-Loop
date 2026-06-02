Shader "WoolLoop/3D/WoolBox"
{
    Properties
    {
		[NoScaleOffset]_EffectTex("Effect Map", 2D) = "white" {}
		[NoScaleOffset]_BumpMap("Normal Map", 2D) = "bump" {}
		_SizeTex("Texture Scale", Float) = 1
		_MainColor("Main Color", Color) = (1,1,1,1)
		_ShadowColor("Shadow Color", Color) = (0.5,0.5,0.5,0)
		
	}
    SubShader
    {
        Tags { "RenderType" = "Opaque" "RenderPipeline" = "UniversalPipeline" }
		
        Pass
        {
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
			#pragma target 2.0
			#pragma fragmentoption ARB_precision_hint_fastest

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            struct Attributes
            {
                half4 positionOS   : POSITION;
				half2 uv : TEXCOORD0;
				half3 normal : NORMAL;
				half4 tangent : TANGENT;
            };

            struct Varyings
            {
                half4 positionHCS  : SV_POSITION;
				half3 uv : TEXCOORD0;
				half4 tspace0 : TEXCOORD1; // tangent.x, bitangent.x, normal.x, viewDir.x
                half4 tspace1 : TEXCOORD2; // tangent.y, bitangent.y, normal.y, viewDir.y
                half4 tspace2 : TEXCOORD3; // tangent.z, bitangent.z, normal.z, viewDir.z
            };
			
			sampler2D _BumpMap, _EffectTex;
			CBUFFER_START(UnityPerMaterial)
				half _SizeTex;
				half4 _MainColor, _ShadowColor;
			CBUFFER_END

            Varyings vert(Attributes IN)
            {
                Varyings OUT;
				
                
				OUT.uv.xy = IN.uv * _SizeTex;
				OUT.uv.z = IN.positionOS.y+0.5;
				OUT.uv.z = 1-OUT.uv.z;
				
				half3 viewDir = _WorldSpaceCameraPos - mul(unity_ObjectToWorld,IN.positionOS).xyz;
				
				VertexNormalInputs NormalInput =  GetVertexNormalInputs(IN.normal, IN.tangent);
				OUT.tspace0 = half4(NormalInput.tangentWS.x, NormalInput.bitangentWS.x, NormalInput.normalWS.x, viewDir.x);
				OUT.tspace1 = half4(NormalInput.tangentWS.y, NormalInput.bitangentWS.y, NormalInput.normalWS.y, viewDir.y);
				OUT.tspace2 = half4(NormalInput.tangentWS.z, NormalInput.bitangentWS.z, NormalInput.normalWS.z, viewDir.z);
				OUT.positionHCS = TransformObjectToHClip(IN.positionOS.xyz);
				
                return OUT;
            }
			
			half3 DirectionLight()
			{
				return half3(-0.32, 0.77, -0.56);
			}
			
            half4 frag(Varyings i) : SV_Target
            {
				half3 tnormal = UnpackNormal(tex2D(_BumpMap, i.uv.xy));
				half3 effect = tex2D(_EffectTex, i.uv.xy).xyz;
				half3 worldNormal;
                worldNormal.x = dot(i.tspace0.xyz, tnormal);
                worldNormal.y = dot(i.tspace1.xyz, tnormal);
                worldNormal.z = dot(i.tspace2.xyz, tnormal);
				
				//Color
				half dotNL = dot(normalize(worldNormal),normalize(DirectionLight()));
			
				half topBias = saturate(worldNormal.y); 
				half combinedLighting = dotNL * (topBias * 0.7);
			
				half lighting = smoothstep(0.1, 0.5, combinedLighting)+0.5;
				
				//lighting = smoothstep(-_ShadowColor.a,1-_ShadowColor.a,lighting);
				if(lighting == 0)
				{
					lighting -= (1-effect.r)*0.1;
				}
				else
				{
					lighting *= saturate(effect.r+0.2);
				}
				
				half4 finalColor;
                finalColor.rgb = lerp(_ShadowColor.rgb, _MainColor.rgb, lighting);
                finalColor.a = _MainColor.a;

				
				//Specular
				half3 refVec = reflect(-DirectionLight(), worldNormal);
				half spec = saturate(dot(normalize(refVec), normalize(half3(i.tspace0.w, i.tspace1.w, i.tspace2.w))));
				spec = pow(spec,10+0.001);
				
				finalColor.rgb += spec*effect.b*_MainColor.a*0.8;
				//
				
                return finalColor;
            }
            ENDHLSL
        }
    }
}